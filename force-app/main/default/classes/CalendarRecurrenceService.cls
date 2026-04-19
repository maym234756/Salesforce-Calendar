/**
 * CalendarRecurrenceService
 *
 * Parses RFC-5545 RRULE strings and expands a recurring Calendar_Event__c
 * template into concrete occurrence Datetimes within a requested date window.
 *
 * Supported RRULE properties:
 *   FREQ      – DAILY | WEEKLY | MONTHLY | YEARLY
 *   INTERVAL  – positive integer (default 1)
 *   BYDAY     – comma-separated day codes: MO TU WE TH FR SA SU
 *               (WEEKLY only; MONTHLY Nth-weekday not yet supported)
 *   BYMONTHDAY– integer day of month 1–31 (MONTHLY only)
 *   COUNT     – max total occurrences (hard cap: 500)
 *   UNTIL     – date string YYYYMMDD or YYYYMMDDTHHMMSSZ
 *
 * Usage:
 *   List<Datetime> occurrences = CalendarRecurrenceService.expandOccurrences(
 *       eventRecord, rangeStartDate, rangeEndDate
 *   );
 */
public with sharing class CalendarRecurrenceService {

    // Hard cap: never expand more than this many occurrences per series per call.
    @TestVisible
    private static final Integer MAX_OCCURRENCES = 500;

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    /**
     * Returns all occurrence start-Datetimes that fall within [rangeStart, rangeEnd]
     * for a recurring event template.  The template must have a non-blank
     * Recurrence_Rule__c.  The template's own Start__c / End__c establish the
     * time-of-day and duration for every occurrence.
     *
     * @param template   Calendar_Event__c with Start__c and Recurrence_Rule__c populated.
     * @param rangeStart inclusive range start date.
     * @param rangeEnd   inclusive range end date.
     * @return           List of Datetime values (occurrence starts) within the range.
     */
    public static List<Datetime> expandOccurrences(
        Calendar_Event__c template,
        Date rangeStart,
        Date rangeEnd
    ) {
        if (template == null || String.isBlank(template.Recurrence_Rule__c) || template.Start__c == null) {
            return new List<Datetime>();
        }

        RRuleParams p = parseRRule(template.Recurrence_Rule__c);
        if (p == null) {
            return new List<Datetime>();
        }

        Datetime seriesStart = template.Start__c;
        Date seriesStartDate = seriesStart.date();

        // Iterate from seriesStartDate forward, collecting matching dates
        List<Datetime> result = new List<Datetime>();
        Integer count = 0;
        Date cursor = seriesStartDate;

        // Advance to rangeStart quickly when possible
        // (skip whole intervals that are before rangeStart)
        Integer maxLoop = MAX_OCCURRENCES * 10; // safety guard against infinite loops
        Integer loopCount = 0;

        while (loopCount < maxLoop) {
            loopCount++;

            if (p.until != null && cursor > p.until) {
                break;
            }

            if (p.count != null && count >= p.count) {
                break;
            }

            List<Date> candidates = getCandidatesForPeriod(cursor, p);

            for (Date candidate : candidates) {
                if (p.until != null && candidate > p.until) {
                    break;
                }
                if (p.count != null && count >= p.count) {
                    break;
                }
                if (candidate < seriesStartDate) {
                    continue;
                }

                count++;

                // Only collect if within the requested range
                if (candidate >= rangeStart && candidate <= rangeEnd) {
                    Time t = seriesStart.time();
                    result.add(Datetime.newInstance(candidate, t));
                }

                // Once cursor has passed rangeEnd and we've gathered enough, stop.
                // But only stop early if we're also past rangeEnd by a full interval.
            }

            // Stop iterating once the period cursor is past the range end (and past until/count)
            if (cursor > rangeEnd) {
                break;
            }

            cursor = advanceCursor(cursor, p);
        }

        return result;
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    /**
     * Parse an RRULE string into a structured parameter object.
     * Returns null if FREQ is missing or unrecognised.
     */
    private static RRuleParams parseRRule(String rrule) {
        RRuleParams p = new RRuleParams();

        for (String part : rrule.trim().split(';')) {
            if (String.isBlank(part)) {
                continue;
            }

            Integer eqIdx = part.indexOf('=');
            if (eqIdx < 0) {
                continue;
            }

            String key   = part.substring(0, eqIdx).trim().toUpperCase();
            String value = part.substring(eqIdx + 1).trim().toUpperCase();

            if (key == 'FREQ') {
                p.freq = value;
            } else if (key == 'INTERVAL') {
                try { p.interval = Integer.valueOf(value); } catch (Exception ex) { }
            } else if (key == 'COUNT') {
                try { p.count = Math.min(Integer.valueOf(value), MAX_OCCURRENCES); } catch (Exception ex) { }
            } else if (key == 'UNTIL') {
                p.until = parseUntilDate(value);
            } else if (key == 'BYDAY') {
                p.byDay = parseDayCodes(value);
            } else if (key == 'BYMONTHDAY') {
                try { p.byMonthDay = Integer.valueOf(value); } catch (Exception ex) { }
            }
        }

        if (String.isBlank(p.freq)) {
            return null;
        }

        if (p.interval == null || p.interval < 1) {
            p.interval = 1;
        }

        return p;
    }

    /**
     * Returns the candidate occurrence dates for a given cursor period.
     * For DAILY/YEARLY: one date per period.
     * For WEEKLY with BYDAY: one per matching day-of-week in the week.
     * For MONTHLY: the specific day-of-month, or the cursor date if no BYMONTHDAY.
     */
    private static List<Date> getCandidatesForPeriod(Date cursor, RRuleParams p) {
        List<Date> candidates = new List<Date>();

        if (p.freq == 'DAILY') {
            candidates.add(cursor);

        } else if (p.freq == 'WEEKLY') {
            if (p.byDay == null || p.byDay.isEmpty()) {
                candidates.add(cursor);
            } else {
                // Enumerate all 7 days of the week starting at cursor (Monday-anchored week)
                Date weekStart = getWeekStart(cursor);
                for (Integer d = 0; d < 7; d++) {
                    Date candidate = weekStart.addDays(d);
                    String dayCode = getDayCode(candidate);
                    if (p.byDay.contains(dayCode)) {
                        candidates.add(candidate);
                    }
                }
            }

        } else if (p.freq == 'MONTHLY') {
            if (p.byMonthDay != null) {
                Integer lastDay = Date.daysInMonth(cursor.year(), cursor.month());
                Integer targetDay = Math.min(p.byMonthDay, lastDay);
                candidates.add(Date.newInstance(cursor.year(), cursor.month(), targetDay));
            } else {
                candidates.add(cursor);
            }

        } else if (p.freq == 'YEARLY') {
            candidates.add(cursor);
        }

        return candidates;
    }

    /**
     * Advances the cursor by one full period (INTERVAL periods of FREQ).
     */
    private static Date advanceCursor(Date cursor, RRuleParams p) {
        if (p.freq == 'DAILY') {
            return cursor.addDays(p.interval);

        } else if (p.freq == 'WEEKLY') {
            if (p.byDay == null || p.byDay.isEmpty()) {
                // No BYDAY: just step forward by interval weeks from the current cursor date
                return cursor.addDays(7 * p.interval);
            }
            // With BYDAY: advance to the start of the next interval-th week
            Date weekStart = getWeekStart(cursor);
            return weekStart.addDays(7 * p.interval);

        } else if (p.freq == 'MONTHLY') {
            return cursor.addMonths(p.interval);

        } else if (p.freq == 'YEARLY') {
            return cursor.addYears(p.interval);
        }

        return cursor.addDays(1); // fallback
    }

    /** Returns the Monday of the week containing d. */
    private static Date getWeekStart(Date d) {
        // Date.toStartOfWeek() returns Sunday; shift to Monday
        Date sun = d.toStartOfWeek();
        // If the date itself is Sunday (toStartOfWeek == date), Monday is +1
        // Otherwise Monday is sun + 1
        return sun.addDays(1);
    }

    /** Returns two-letter RFC-5545 day code (MO, TU, WE, TH, FR, SA, SU) for a date. */
    private static String getDayCode(Date d) {
        // dayOfWeek: 1=Sun … 7=Sat in Apex
        Integer dow = getDayOfWeek(d); // 0=Sun,1=Mon,...,6=Sat
        String[] codes = new String[]{ 'SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA' };
        return codes[dow];
    }

    /**
     * Returns day-of-week index 0 (Sun) through 6 (Sat).
     * Apex does not expose dayOfWeek() directly on Date, so we use a reference epoch.
     */
    private static Integer getDayOfWeek(Date d) {
        // 2000-01-02 is a Sunday (epoch reference)
        Date epoch = Date.newInstance(2000, 1, 2);
        Integer diff = epoch.daysBetween(d);
        // diff can be negative; modulo fix:
        Integer mod = Math.mod(diff, 7);
        return mod < 0 ? mod + 7 : mod;
    }

    /** Parses BYDAY value into a Set of two-letter day codes. */
    private static Set<String> parseDayCodes(String value) {
        Set<String> codes = new Set<String>();
        for (String token : value.split(',')) {
            String trimmed = token.trim().toUpperCase();
            // Strip leading ordinal digits (e.g., "1MO" → "MO", "-1FR" → "FR")
            if (trimmed.length() > 2) {
                trimmed = trimmed.right(2);
            }
            if (trimmed.length() == 2) {
                codes.add(trimmed);
            }
        }
        return codes;
    }

    /** Parses UNTIL value: YYYYMMDD or YYYYMMDDTHHMMSSZ. */
    private static Date parseUntilDate(String value) {
        try {
            if (value.length() >= 8) {
                Integer y = Integer.valueOf(value.substring(0, 4));
                Integer m = Integer.valueOf(value.substring(4, 6));
                Integer d = Integer.valueOf(value.substring(6, 8));
                return Date.newInstance(y, m, d);
            }
        } catch (Exception ex) { }
        return null;
    }

    // -------------------------------------------------------------------------
    // Inner classes
    // -------------------------------------------------------------------------

    @TestVisible
    private class RRuleParams {
        public String freq;
        public Integer interval;
        public Integer count;
        public Date until;
        public Set<String> byDay;
        public Integer byMonthDay;
    }
}
