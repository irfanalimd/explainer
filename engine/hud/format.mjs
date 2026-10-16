// Readout formatting for meters: value + format -> [number, unit], so the unit can be set quieter than the figure.
//   int "1,234"   bytes "1.4 KB" (1024-based, like page and block sizes)   ms "4.1 ms" / "1.24 s"   pct "42%"   x "2.4×"
// Options (from the counter's declaration): `decimals` fixes the digits after the point for int and x ("9.25"),
// `unit` is a suffix for int counters ("10 MSS"); both are optional.

const trim0 = (s) => s.replace(/\.0$/, "");
const grouped = (n) => Math.round(n).toLocaleString("en-US");

export function formatCounter(value, format = "int", o = {}) {
  const v = Number.isFinite(value) ? value : 0;
  const dec = Number.isInteger(o?.decimals) && o.decimals >= 0 ? Math.min(6, o.decimals) : null;
  const unit = typeof o?.unit === "string" ? o.unit : "";
  const a = Math.abs(v);
  switch (format) {
    case "bytes": {
      if (a < 1024) return [String(Math.round(v)), "B"];
      const units = ["KB", "MB", "GB", "TB"];
      let x = v / 1024, i = 0;
      while (Math.abs(x) >= 1024 && i < units.length - 1) { x /= 1024; i++; }
      return [Math.abs(x) < 10 ? trim0(x.toFixed(1)) : String(Math.round(x)), units[i]];
    }
    case "ms": {
      if (a >= 1000) return [(v / 1000).toFixed(a >= 10000 ? 1 : 2), "s"];
      if (a >= 100) return [String(Math.round(v)), "ms"];
      if (a >= 1 || a === 0) return [a === 0 ? "0" : v.toFixed(1), "ms"];
      return [v.toFixed(2), "ms"];
    }
    case "pct": {
      // a fraction 0..1 is scaled; anything larger is taken as already in percent
      const p = a <= 1 ? v * 100 : v;
      return [Math.abs(p) < 10 && p !== Math.round(p) ? p.toFixed(1) : String(Math.round(p)), "%"];
    }
    case "x": return [v.toFixed(dec ?? (Math.abs(v) < 100 ? 1 : 0)), "×"];
    case "int":
    default:
      if (dec !== null) return [v.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec }), unit];
      return [Number.isInteger(v) || format === "int" ? grouped(v) : v.toFixed(2), unit];
  }
}

export const formatText = (value, format, o) => { const [n, u] = formatCounter(value, format, o); return u ? (u === "%" || u === "×" ? n + u : `${n} ${u}`) : n; };
