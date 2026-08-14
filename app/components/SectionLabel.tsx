// app/components/SectionLabel.tsx
// Shared section heading (icon + bold title) used on the dashboard and the
// crew page so both pages read as one visual system.

import type { IconProps } from "~/images/icons";

export function SectionLabel({ icon: Icon, noMargin, children }: {
  icon: (props: IconProps) => React.ReactElement;
  /** Omit the built-in bottom margin when the caller supplies its own (e.g. a
   *  flex row pairing the label with an inline action). */
  noMargin?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`flex items-center gap-2.5 ${noMargin ? "" : "mb-5"}`}>
      <Icon size="lg" className="text-blue-500 dark:text-blue-400" />
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{children}</h2>
    </div>
  );
}
