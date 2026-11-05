import { cx } from "./ui";

const OPTIONS = [
  { fractions: false, label: "Whole numbers", hint: "pcs, boxes, bottles" },
  { fractions: true, label: "Fractions allowed", hint: "kg, litres, metres" },
];

export function quantityRuleLabel(allowFractions: boolean) {
  return allowFractions ? "Fractions allowed" : "Whole numbers";
}

/** Picks whether a category's items are counted in whole numbers or may use fractions. */
export function QuantityRuleChoice({ value, onChange }: { value: boolean; onChange: (allowFractions: boolean) => void }) {
  return (
    <div role="radiogroup" aria-label="Quantities" className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
      {OPTIONS.map((option) => (
        <button
          key={option.label}
          type="button"
          role="radio"
          aria-checked={value === option.fractions}
          onClick={() => onChange(option.fractions)}
          className={cx(
            "rounded-lg px-3 py-1.5 text-left transition",
            value === option.fractions ? "bg-white shadow-sm" : "text-slate-500 hover:text-abyss-800",
          )}
        >
          <span className="block text-sm font-semibold">{option.label}</span>
          <span className="block text-xs text-slate-500">{option.hint}</span>
        </button>
      ))}
    </div>
  );
}
