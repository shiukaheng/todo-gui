/**
 * Maps time distance (in seconds) to urgency color.
 * Uses blue intensity scale: intense blue (urgent) → white (relaxed)
 * - Past due / < 1 hour: intense blue
 * - ~1 day: medium blue  
 * - >= 1 week: near white (matches non-deadline nodes)
 * Uses logarithmic scale for smooth perceptual transitions.
 */

// Time constants in seconds
const ONE_HOUR = 3600;
const ONE_WEEK = 604800;

// Blue hue (0-360)
const HUE_BLUE = 215;

/**
 * Convert HSL to RGB color array [r, g, b] with values 0-1
 */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
    h = h / 360; // normalize to 0-1
    let r: number, g: number, b: number;

    if (s === 0) {
        r = g = b = l;
    } else {
        const hue2rgb = (p: number, q: number, t: number) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1/6) return p + (q - p) * 6 * t;
            if (t < 1/2) return q;
            if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        };

        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
    }

    return [r, g, b];
}

/**
 * Get urgency color based on seconds until due.
 * @param secondsUntilDue - Positive = future, negative = past due
 * @returns RGB color as [r, g, b] with values 0-1
 */
export function getUrgencyColor(secondsUntilDue: number): [number, number, number] {
    // Past due: most intense blue
    if (secondsUntilDue <= 0) {
        return hslToRgb(HUE_BLUE, 0.85, 0.45);
    }

    // Clamp to range [1 hour, 1 week]
    const clampedTime = Math.max(ONE_HOUR, Math.min(ONE_WEEK, secondsUntilDue));

    // Logarithmic interpolation for smooth perceptual transition
    const logMin = Math.log(ONE_HOUR);
    const logMax = Math.log(ONE_WEEK);
    const logTime = Math.log(clampedTime);

    // Normalize to 0-1 (0 = urgent, 1 = relaxed)
    const t = (logTime - logMin) / (logMax - logMin);

    // Interpolate saturation: 85% (urgent) → 10% (relaxed/near white)
    const saturation = 0.85 - t * 0.75;
    
    // Interpolate lightness: 45% (urgent/vivid) → 90% (relaxed/near white)
    const lightness = 0.45 + t * 0.45;

    return hslToRgb(HUE_BLUE, saturation, lightness);
}

/**
 * Get urgency color as CSS string.
 * @param secondsUntilDue - Positive = future, negative = past due
 * @returns CSS color string like "rgb(255, 100, 50)"
 */
export function getUrgencyColorCSS(secondsUntilDue: number): string {
    const [r, g, b] = getUrgencyColor(secondsUntilDue);
    return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
}

/**
 * Get urgency color from unix timestamp.
 * @param dueTimestamp - Unix timestamp in seconds
 * @returns RGB color as [r, g, b] with values 0-1
 */
export function getUrgencyColorFromTimestamp(dueTimestamp: number): [number, number, number] {
    const now = Date.now() / 1000;
    return getUrgencyColor(dueTimestamp - now);
}

/**
 * Get urgency color as CSS string from unix timestamp.
 * @param dueTimestamp - Unix timestamp in seconds
 * @returns CSS color string
 */
export function getUrgencyColorCSSFromTimestamp(dueTimestamp: number): string {
    const now = Date.now() / 1000;
    return getUrgencyColorCSS(dueTimestamp - now);
}
