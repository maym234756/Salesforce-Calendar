import { LightningElement, api } from 'lwc';

export default class CalendarLegend extends LightningElement {
    @api items = [];

    get normalizedItems() {
        return (Array.isArray(this.items) ? this.items : []).map((item, index) => {
            const label = item.label || item.name || `Calendar ${index + 1}`;
            const color = item.color || extractColor(item.styleText) || '#0176d3';

            return {
                key: item.id || item.key || `${label}-${index}`,
                label,
                swatchStyle: `display:inline-block;width:0.75rem;height:0.75rem;border-radius:999px;background:${color};`
            };
        });
    }

    get hasItems() {
        return this.normalizedItems.length > 0;
    }
}

function extractColor(styleText) {
    if (!styleText || typeof styleText !== 'string') {
        return null;
    }

    const match = styleText.match(/background\s*:\s*([^;]+)/i);
    return match ? match[1].trim() : null;
}