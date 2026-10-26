/**
 * Charts drawn with the Canvas API (no library).
 *
 *   BaseChart      : base class - handles sizing, sharpness (devicePixelRatio),
 *                    redraws on resize (ResizeObserver) / theme change, hover tooltip
 *   |-- BarChart    : grouped columns, e.g. new listings + orders per day
 *   |-- LineChart   : line + filled area, e.g. revenue per day
 *   |-- HBarChart   : horizontal bars, e.g. listings per category
 *   `-- DonutChart  : donut, e.g. listings by status
 *
 * Required HTML:  <div class="chart"> <canvas></canvas> <div class="chart__tooltip" hidden></div> </div>
 * Colors come from CSS variables (--color-*) so they are correct in both light and dark themes.
 * Colors in the data can be a color code ("#ee4d2d") or a CSS variable name ("--color-success").
 */

/** Read a color from the current theme's CSS variables */
function themeColors() {
  const css = getComputedStyle(document.documentElement);
  const v = (name) => css.getPropertyValue(name).trim();
  return {
    text: v('--color-text'),
    muted: v('--color-text-muted'),
    grid: v('--color-border'),
    surface: v('--color-surface'),
    primary: v('--color-primary'),
    success: v('--color-success'),
    info: v('--color-info'),
    warning: v('--color-warning'),
    danger: v('--color-danger'),
  };
}

/** "--color-success" -> actual value of the CSS variable in the current theme; color codes stay as is */
function resolveColor(color, fallback) {
  if (!color) return fallback;
  if (!color.startsWith('--')) return color;
  return getComputedStyle(document.documentElement).getPropertyValue(color).trim() || fallback;
}

/** Round the max value up to a "nice" number for axis ticks: 7 -> 8, 1234 -> 1500 */
function niceMax(value) {
  if (value <= 0) return 4;
  const exp = 10 ** Math.floor(Math.log10(value));
  const step = [1, 1.5, 2, 2.5, 4, 5, 8, 10].find((s) => s * exp >= value);
  return step * exp;
}

const FONT = '12px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

// =========================================================
//  BASE CLASS
// =========================================================
export { resolveColor };

export class BaseChart {
  /** Hoverable areas: [{ x, y, w, h, html }] - filled by subclasses while drawing */
  hitAreas = [];

  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} data      chart data, each chart type has its own shape
   * @param {object} [options] { height, format: (value) => string }
   */
  constructor(canvas, data, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.data = data;
    this.options = { height: 260, format: (n) => n.toLocaleString('vi-VN'), ...options };
    this.tooltip = canvas.parentElement.querySelector('.chart__tooltip');

    // Redraw when the container is resized (phone rotation, window resize...)
    this.resizeObserver = new ResizeObserver(() => this.render());
    this.resizeObserver.observe(canvas.parentElement);
    // Redraw when switching light / dark theme (CustomEvent from components/theme.js)
    this.onTheme = () => this.render();
    window.addEventListener('theme:change', this.onTheme);

    canvas.addEventListener('mousemove', (e) => this.handleHover(e));
    canvas.addEventListener('mouseleave', () => this.hideTooltip());
  }

  /** Update the data and redraw */
  update(data) {
    this.data = data;
    this.render();
  }

  destroy() {
    this.resizeObserver.disconnect();
    window.removeEventListener('theme:change', this.onTheme);
  }

  /**
   * Size the canvas to its container, multiplied by devicePixelRatio so it stays sharp
   * on high-density screens (Retina, phones...).
   */
  setup() {
    const ratio = window.devicePixelRatio || 1;
    const width = this.canvas.parentElement.clientWidth;
    const height = this.options.height;
    this.canvas.width = Math.round(width * ratio);
    this.canvas.height = Math.round(height * ratio);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0); // draw in CSS pixels
    this.ctx.clearRect(0, 0, width, height);
    this.ctx.font = FONT;
    this.colors = themeColors();
    this.hitAreas = [];
    return { width, height };
  }

  render() {
    if (!this.canvas.isConnected || this.canvas.parentElement.clientWidth === 0) return;
    const { width, height } = this.setup();
    this.draw(width, height);
  }

  /** Must be implemented by subclasses */
  // eslint-disable-next-line no-unused-vars
  draw(width, height) {
    throw new Error('Lớp con phải cài đặt draw()');
  }

  /** Draw the "no data" message in the center */
  drawEmpty(width, height) {
    const { ctx } = this;
    ctx.fillStyle = this.colors.muted;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Chưa có dữ liệu', width / 2, height / 2);
  }

  // ---------- Tooltip ----------
  handleHover(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const hit = this.hitAreas.find((a) => (a.contains ? a.contains(x, y) : x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h));
    if (!hit) {
      this.hideTooltip();
      return;
    }
    this.showTooltip(hit.lines, x, y);
  }

  /** lines: [{ label, value, color? }] -> build the content with DOM APIs (no innerHTML) */
  showTooltip(lines, x, y) {
    if (!this.tooltip) return;
    this.tooltip.replaceChildren(
      ...lines.map(({ label, value, color }) => {
        const row = document.createElement('div');
        if (color) {
          const dot = document.createElement('span');
          dot.className = 'chart__dot';
          dot.style.background = color;
          row.append(dot);
        }
        const strong = document.createElement('strong');
        strong.textContent = value;
        row.append(`${label}${value !== '' ? ': ' : ''}`, strong);
        return row;
      }),
    );
    this.tooltip.hidden = false;
    // Keep the tooltip inside the container (flip to the left near the right edge)
    const box = this.tooltip.getBoundingClientRect();
    const maxX = this.canvas.clientWidth - box.width - 8;
    this.tooltip.style.left = `${Math.min(x + 12, Math.max(8, maxX))}px`;
    this.tooltip.style.top = `${Math.max(8, y - box.height - 8)}px`;
  }

  hideTooltip() {
    if (this.tooltip) this.tooltip.hidden = true;
  }

  // ---------- Axes for bar / line charts ----------
  /**
   * Draw horizontal grid lines + Y axis labels, return the plot area metrics.
   * @returns {{ left, right, top, bottom, plotH, max, y: (value) => number }}
   */
  drawAxes(width, height, maxValue, labels) {
    const { ctx, colors } = this;
    const format = this.options.axisFormat ?? this.options.format;
    const max = niceMax(maxValue);
    const ticks = 4;
    const left = Math.max(...Array.from({ length: ticks + 1 }, (_, i) => ctx.measureText(format((max / ticks) * i)).width)) + 12;
    const right = width - 8;
    const top = 12;
    const bottom = height - 28;
    const plotH = bottom - top;
    const y = (value) => bottom - (value / max) * plotH;

    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    for (let i = 0; i <= ticks; i += 1) {
      const value = (max / ticks) * i;
      const yy = Math.round(y(value)) + 0.5;
      ctx.strokeStyle = colors.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(left, yy);
      ctx.lineTo(right, yy);
      ctx.stroke();
      ctx.fillStyle = colors.muted;
      ctx.fillText(format(value), left - 8, yy);
    }

    // X axis labels: skip some when there are many columns so they do not overlap
    const slot = (right - left) / labels.length;
    const every = Math.ceil(46 / slot);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    labels.forEach((label, i) => {
      if (i % every !== 0 && i !== labels.length - 1) return;
      ctx.fillText(label, left + slot * i + slot / 2, bottom + 8);
    });

    return { left, right, top, bottom, plotH, max, y, slot };
  }
}

// =========================================================
//  BAR CHART (grouped)
//  data = { labels: [], series: [{ name, values: [], color }] }
// =========================================================
export class BarChart extends BaseChart {
  draw(width, height) {
    const { labels, series } = this.data;
    const maxValue = Math.max(0, ...series.flatMap((s) => s.values));
    const axes = this.drawAxes(width, height, maxValue, labels);
    const { ctx } = this;

    const groupW = axes.slot * 0.7;
    const barW = groupW / series.length;
    labels.forEach((label, i) => {
      const groupX = axes.left + axes.slot * i + (axes.slot - groupW) / 2;
      series.forEach((s, j) => {
        const value = s.values[i] ?? 0;
        const x = groupX + barW * j;
        const top = axes.y(value);
        const h = axes.bottom - top;
        ctx.fillStyle = resolveColor(s.color, this.colors.primary);
        if (h > 0) {
          ctx.beginPath();
          ctx.roundRect(x + 1, top, Math.max(barW - 2, 1), h, [3, 3, 0, 0]);
          ctx.fill();
        }
      });
      // Hovering a column group -> tooltip lists every series for that day
      this.hitAreas.push({
        x: axes.left + axes.slot * i,
        y: axes.top,
        w: axes.slot,
        h: axes.plotH,
        lines: [
          { label, value: '' },
          ...series.map((s) => ({ label: s.name, value: this.options.format(s.values[i] ?? 0), color: resolveColor(s.color, this.colors.primary) })),
        ],
      });
    });
  }
}

// =========================================================
//  LINE CHART + filled area below
//  data = { labels: [], values: [], name, color? }
// =========================================================
export class LineChart extends BaseChart {
  draw(width, height) {
    const { labels, values, name } = this.data;
    const color = resolveColor(this.data.color, this.colors.primary);
    const axes = this.drawAxes(width, height, Math.max(0, ...values), labels);
    const { ctx } = this;
    const points = values.map((value, i) => ({ x: axes.left + axes.slot * i + axes.slot / 2, y: axes.y(value), value }));

    // Area fading out downwards (gradient)
    const gradient = ctx.createLinearGradient(0, axes.top, 0, axes.bottom);
    gradient.addColorStop(0, `${color}55`);
    gradient.addColorStop(1, `${color}00`);
    ctx.beginPath();
    ctx.moveTo(points[0].x, axes.bottom);
    points.forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.lineTo(points.at(-1).x, axes.bottom);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Line
    ctx.beginPath();
    points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Points
    points.forEach((p, i) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = this.colors.surface;
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();
      this.hitAreas.push({
        x: p.x - axes.slot / 2,
        y: axes.top,
        w: axes.slot,
        h: axes.plotH,
        lines: [{ label: labels[i], value: '' }, { label: name, value: this.options.format(p.value), color }],
      });
    });
  }
}

// =========================================================
//  HORIZONTAL BARS (categories)
//  data = { items: [{ label, value }] }
// =========================================================
export class HBarChart extends BaseChart {
  draw(width, height) {
    const { items } = this.data;
    if (items.length === 0) return this.drawEmpty(width, height);
    const { ctx, colors } = this;
    const max = Math.max(1, ...items.map((i) => i.value));
    const labelW = Math.min(width * 0.42, Math.max(...items.map((i) => ctx.measureText(i.label).width)) + 12);
    const rowH = height / items.length;
    const barH = Math.min(18, rowH * 0.6);
    const valueW = 32;

    ctx.textBaseline = 'middle';
    items.forEach((item, i) => {
      const cy = rowH * i + rowH / 2;
      // Label (truncated when too long)
      ctx.fillStyle = colors.text;
      ctx.textAlign = 'left';
      let label = item.label;
      while (ctx.measureText(label).width > labelW - 12 && label.length > 3) label = `${label.slice(0, -2)}…`;
      ctx.fillText(label, 0, cy);

      // Track + value bar
      const fullW = width - labelW - valueW;
      ctx.fillStyle = colors.grid;
      ctx.beginPath();
      ctx.roundRect(labelW, cy - barH / 2, fullW, barH, barH / 2);
      ctx.fill();
      const w = (item.value / max) * fullW;
      if (w > 0) {
        ctx.fillStyle = colors.primary;
        ctx.beginPath();
        ctx.roundRect(labelW, cy - barH / 2, Math.max(w, barH), barH, barH / 2);
        ctx.fill();
      }
      ctx.fillStyle = colors.muted;
      ctx.textAlign = 'right';
      ctx.fillText(this.options.format(item.value), width, cy);

      this.hitAreas.push({ x: 0, y: rowH * i, w: width, h: rowH, lines: [{ label: item.label, value: this.options.format(item.value) }] });
    });
  }
}

// =========================================================
//  DONUT (proportions)
//  data = { items: [{ label, value, color }], centerLabel }
// =========================================================
export class DonutChart extends BaseChart {
  draw(width, height) {
    const { items, centerLabel = 'Tổng' } = this.data;
    const total = items.reduce((sum, i) => sum + i.value, 0);
    if (total === 0) return this.drawEmpty(width, height);

    const { ctx, colors } = this;
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) / 2 - 8;
    const inner = radius * 0.62;
    let start = -Math.PI / 2; // start at 12 o'clock

    items.forEach((item) => {
      if (item.value === 0) return;
      const angle = (item.value / total) * Math.PI * 2;
      const end = start + angle;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, start, end);
      ctx.arc(cx, cy, inner, end, start, true);
      ctx.closePath();
      const color = resolveColor(item.color, this.colors.primary);
      ctx.fillStyle = color;
      ctx.fill();
      // Thin border between slices
      ctx.strokeStyle = colors.surface;
      ctx.lineWidth = 2;
      ctx.stroke();

      const [from, to] = [start, end];
      const percent = Math.round((item.value / total) * 100);
      this.hitAreas.push({
        // Point is inside the ring and within this slice's angle range
        contains: (x, y) => {
          const dx = x - cx;
          const dy = y - cy;
          const dist = Math.hypot(dx, dy);
          if (dist < inner || dist > radius) return false;
          let a = Math.atan2(dy, dx);
          if (a < -Math.PI / 2) a += Math.PI * 2;
          return a >= from && a < to;
        },
        lines: [{ label: item.label, value: `${this.options.format(item.value)} (${percent}%)`, color }],
      });
      start = end;
    });

    // Total in the center
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = colors.text;
    ctx.font = `700 ${Math.round(radius * 0.32)}px system-ui, sans-serif`;
    ctx.fillText(this.options.format(total), cx, cy - 6);
    ctx.font = FONT;
    ctx.fillStyle = colors.muted;
    ctx.fillText(centerLabel, cx, cy + radius * 0.22);
  }
}
