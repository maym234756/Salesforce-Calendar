const { createElement } = require('lwc');
const CalendarLegend = require('c/calendarLegend').default;

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('c-calendar-legend', () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        jest.clearAllMocks();
    });

    it('renders nothing when no items are provided', async () => {
        const el = createElement('c-calendar-legend', { is: CalendarLegend });
        el.items = [];
        document.body.appendChild(el);
        await flushPromises();

        expect(el.shadowRoot.textContent.trim()).toBe('');
    });

    it('renders labels for provided legend items', async () => {
        const el = createElement('c-calendar-legend', { is: CalendarLegend });
        el.items = [
            { id: 'a', label: 'Sales', color: '#0176d3' },
            { id: 'b', label: 'Service', color: '#22bb33' }
        ];
        document.body.appendChild(el);
        await flushPromises();

        expect(el.shadowRoot.textContent).toContain('Sales');
        expect(el.shadowRoot.textContent).toContain('Service');
    });

    it('falls back to item.name when label is missing', async () => {
        const el = createElement('c-calendar-legend', { is: CalendarLegend });
        el.items = [{ id: 'a', name: 'Operations', color: '#ff6600' }];
        document.body.appendChild(el);
        await flushPromises();

        expect(el.shadowRoot.textContent).toContain('Operations');
    });

    it('extracts a color from styleText when color is missing', async () => {
        const el = createElement('c-calendar-legend', { is: CalendarLegend });
        el.items = [{ id: 'a', label: 'Styled', styleText: 'background:#123456;color:#fff;' }];
        document.body.appendChild(el);
        await flushPromises();

        const swatch = el.shadowRoot.querySelector('[style]');
        expect(swatch.getAttribute('style')).toContain('#123456');
    });

    it('falls back to the default swatch color when color is invalid', async () => {
        const el = createElement('c-calendar-legend', { is: CalendarLegend });
        el.items = [{ id: 'a', label: 'Broken', color: 'not-a-color' }];
        document.body.appendChild(el);
        await flushPromises();

        const swatch = el.shadowRoot.querySelector('[style]');
        expect(swatch.getAttribute('style')).toContain('#0176d3');
    });

    it('dispatches a color change event for editable legend rows', async () => {
        const el = createElement('c-calendar-legend', { is: CalendarLegend });
        const handler = jest.fn();
        el.editable = true;
        el.items = [{ id: 'a', label: 'Sales', color: '#0176d3' }];
        el.addEventListener('calendarcolorchange', handler);
        document.body.appendChild(el);
        await flushPromises();

        const picker = el.shadowRoot.querySelector('input[type="color"]');
        picker.value = '#ff6600';
        picker.dispatchEvent(new Event('change'));
        await flushPromises();

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler.mock.calls[0][0].detail).toEqual({
            calendarId: 'a',
            color: '#ff6600'
        });
    });

    it('dispatches a reset event when reset is clicked', async () => {
        const el = createElement('c-calendar-legend', { is: CalendarLegend });
        const handler = jest.fn();
        el.editable = true;
        el.items = [{ id: 'a', label: 'Sales', color: '#ff6600', defaultColor: '#0176d3' }];
        el.addEventListener('calendarcolorreset', handler);
        document.body.appendChild(el);
        await flushPromises();

        el.shadowRoot.querySelector('button').click();
        await flushPromises();

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler.mock.calls[0][0].detail).toEqual({ calendarId: 'a' });
    });
});
