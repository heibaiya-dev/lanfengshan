import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import type { ReactElement } from "react";

type MenuOption = {
  value: string;
  label: string;
  detail?: string;
};

type MaterialMenuProps = {
  label: string;
  value: string;
  options: MenuOption[];
  onChange: (value: string) => void;
  children: ReactElement;
};

export function MaterialMenu({ label, value, options, onChange, children }: MaterialMenuProps) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{children}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="material-menu"
          side="top"
          sideOffset={12}
          align="center"
          collisionPadding={16}
          aria-label={label}
        >
          <DropdownMenu.Label className="material-menu-title">{label}</DropdownMenu.Label>
          <DropdownMenu.RadioGroup value={value} onValueChange={onChange}>
            {options.map((option) => (
              <DropdownMenu.RadioItem
                value={option.value}
                className="material-menu-item"
                key={option.value}
                textValue={option.label}
              >
                <span className="menu-option-copy">
                  <span>{option.label}</span>
                  {option.detail && <span className="menu-option-detail">{option.detail}</span>}
                </span>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
