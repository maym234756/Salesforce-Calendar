import { LightningElement, api } from 'lwc';

const HEX_COLOR_REGEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
function sanitizeColor(v) { return HEX_COLOR_REGEX.test(v || '') ? v : '#0176d3'; }

export default class CalendarLegend extends LightningElement {
    @api items = [];
    @api editable = false;

    get normalizedItems() {
        return (Array.isArray(this.items) ? this.items : []).map((item, index) => {
            const label = item.label || item.name || `Calendar ${index + 1}`;
            const color = sanitizeColor(item.color || extractColor(item.styleText) || '#0176d3');
            const defaultColor = sanitizeColor(item.defaultColor || item.baseColor || color);

            return {
                key: item.id || item.key || `${label}-${index}`,
                id: item.id || item.key || `${label}-${index}`,
                label,
                color,
                defaultColor,
                isDefaultColor: color.toLowerCase() === defaultColor.toLowerCase(),
                colorPickerLabel: `Pick a color for ${label}`,
                resetLabel: `Reset ${label} to its default color`,
                swatchStyle: `display:inline-block;width:0.75rem;height:0.75rem;border-radius:999px;background:${color};`
            };
        });
    }

    get hasItems() {
        return this.normalizedItems.length > 0;
    }

    handleColorChange(event) {
        const calendarId = event.target?.dataset?.itemId;
        if (!calendarId) {
            return;
        }

        this.dispatchEvent(
            new CustomEvent('calendarcolorchange', {
                detail: {
                    calendarId,
                    color: sanitizeColor(event.target.value)
                },
                bubbles: true,
                composed: true
            })
        );
    }

    handleResetClick(event) {
        const calendarId = event.currentTarget?.dataset?.itemId;
        if (!calendarId) {
            return;
        }

        this.dispatchEvent(
            new CustomEvent('calendarcolorreset', {
                detail: { calendarId },
                bubbles: true,
                composed: true
            })
        );
    }
}

function extractColor(styleText) {
    if (!styleText || typeof styleText !== 'string') {
        return null;
    }

    const match = styleText.match(/background\s*:\s*([^;]+)/i);
    return match ? match[1].trim() : null;
}