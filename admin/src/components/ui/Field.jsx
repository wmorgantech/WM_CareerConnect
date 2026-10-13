import { useId } from "react";
import {
  Award,
  BookOpenCheck,
  Briefcase,
  Building2,
  CalendarClock,
  CalendarDays,
  Code2,
  Flag,
  Gauge,
  GraduationCap,
  HelpCircle,
  Layers,
  Link2,
  Lock,
  Mail,
  MapPin,
  MessageSquare,
  MousePointerClick,
  Pencil,
  Percent,
  Phone,
  Timer,
  Type,
  UserRound,
} from "lucide-react";

// One icon per field label. The first matching rule wins; pass `icon={null}` to a field to hide it or
// an icon component to override it.
const ICON_RULES = [
  [/e-?mail/i, Mail],
  [/password/i, Lock],
  [/phone|mobile/i, Phone],
  [/meeting link|logo link|link/i, Link2],
  [/address|city/i, MapPin],
  [/company|college/i, Building2],
  [/contact person|full name|^name$/i, UserRound],
  [/department/i, Building2],
  [/qualification/i, GraduationCap],
  [/passing year|start date|end date/i, CalendarDays],
  [/date and time/i, CalendarClock],
  [/duration/i, Timer],
  [/marks/i, Award],
  [/easy|medium|hard|difficulty|percentage|score/i, Gauge],
  [/drive/i, Briefcase],
  [/level/i, Layers],
  [/stage|status/i, Flag],
  [/topic/i, BookOpenCheck],
  [/action/i, MousePointerClick],
  [/code snippet/i, Code2],
  [/question/i, HelpCircle],
  [/feedback|note|explanation|description/i, MessageSquare],
  [/title/i, Type],
];

function iconFor(label, type) {
  const text = typeof label === "string" ? label : "";
  const rule = ICON_RULES.find(([pattern]) => pattern.test(text));

  if (rule) return rule[1];
  if (type === "date" || type === "datetime-local") return CalendarDays;
  if (type === "number") return Percent;

  return Pencil;
}

// Icon plus text, for labels and legends that are not built from the shared fields below.
export function IconText({ icon: Icon, children }) {
  return (
    <span className="field__label--icon">
      <Icon size={15} className="field__icon" aria-hidden="true" />
      <span>{children}</span>
    </span>
  );
}

function Wrapper({ id, label, error, hint, required, children, icon, type }) {
  const Icon = icon === undefined ? iconFor(label, type) : icon;

  return (
    <div className="field">
      <label htmlFor={id} className="field__label--icon">
        {Icon ? <Icon size={15} className="field__icon" aria-hidden="true" /> : null}
        <span>
          {label}
          {required ? <span className="field__req" aria-hidden="true"> *</span> : null}
        </span>
      </label>
      {children}
      {hint && !error ? (
        <p className="field__hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="field__error" id={`${id}-error`}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

function describedBy(id, error, hint) {
  if (error) {
    return `${id}-error`;
  }

  return hint ? `${id}-hint` : undefined;
}

export function TextField({ label, name, value, onChange, error, hint, required, type = "text", icon, ...rest }) {
  const id = useId();

  return (
    <Wrapper id={id} label={label} error={error} hint={hint} required={required} icon={icon} type={type}>
      <input
        id={id}
        name={name}
        type={type}
        value={value}
        onChange={(event) => onChange(name, event.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy(id, error, hint)}
        aria-required={required || undefined}
        {...rest}
      />
    </Wrapper>
  );
}

export function TextAreaField({ label, name, value, onChange, error, hint, required, rows = 4, icon, ...rest }) {
  const id = useId();

  return (
    <Wrapper id={id} label={label} error={error} hint={hint} required={required} icon={icon}>
      <textarea
        id={id}
        name={name}
        rows={rows}
        value={value}
        onChange={(event) => onChange(name, event.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy(id, error, hint)}
        aria-required={required || undefined}
        {...rest}
      />
    </Wrapper>
  );
}

export function SelectField({ label, name, value, onChange, options, error, hint, required, placeholder, icon, ...rest }) {
  const id = useId();

  return (
    <Wrapper id={id} label={label} error={error} hint={hint} required={required} icon={icon}>
      <select
        id={id}
        name={name}
        value={value}
        onChange={(event) => onChange(name, event.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy(id, error, hint)}
        aria-required={required || undefined}
        {...rest}
      >
        {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Wrapper>
  );
}

export function CheckboxField({ label, name, checked, onChange, hint, ...rest }) {
  const id = useId();

  return (
    <div className="field field--check">
      <label htmlFor={id}>
        <input id={id} name={name} type="checkbox" checked={checked} onChange={(event) => onChange(name, event.target.checked)} {...rest} />
        <span>{label}</span>
      </label>
      {hint ? <p className="field__hint">{hint}</p> : null}
    </div>
  );
}
