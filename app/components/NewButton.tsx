import { useEffect, useRef, useState } from "react";
import { Form } from "react-router";
import { PlusIcon, CheckIcon, CloseIcon } from "~/images/icons";
import Button from "./Button";

type MenuItem = {
  key: string;
  label: string;
  icon: React.ReactNode;
};

const MENU_ITEMS: MenuItem[] = [
  { key: "create", label: "Create New Board", icon: <PlusIcon /> },
  { key: "claim", label: "Claim A Board", icon: <CheckIcon /> },
  // Add more items here as needed
];

export function NewButton({ claimOpen, setClaimOpen }: { claimOpen: boolean; setClaimOpen: (open: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (open && menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  function handleSelect(key: string) {
    setOpen(false);
    if (key === "create") {
      formRef.current?.requestSubmit();
    } else if (key === "claim") {
      setClaimOpen(true);
    }
  }

  return (
    <>
      {/* Hidden form that submits to the dashboard action (creates a new board) */}
      <Form method="post" ref={formRef} />

      <div className="relative" ref={menuRef}>
        <Button
          type="button"
          onClick={() => setOpen((o) => !o)}
          color="primary"
          text="New"
          icon={open ? <CloseIcon /> : <PlusIcon />}
        />

        {open && (
          <div className="absolute right-0 mt-1 w-52 rounded-md border bg-white dark:bg-gray-800 border-blue-500 shadow-lg z-50 overflow-hidden">
            {MENU_ITEMS.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => handleSelect(item.key)}
                className="flex items-center gap-3 w-full px-4 py-2.5 text-sm text-left hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
              >
                <span className="text-gray-500 dark:text-gray-400">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}