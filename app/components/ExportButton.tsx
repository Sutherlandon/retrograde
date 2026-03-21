import { useState, useRef, useEffect } from "react";
import { useBoard } from "~/context/BoardContext";
import { DownloadIcon, TableIcon, DocumentIcon } from "~/images/icons";
import { exportToCSV, exportToMarkdown, downloadFile } from "~/utils/exportBoard";
import Button from "./Button";

export default function ExportButton() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { title, columns } = useBoard();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        open &&
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }

    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, []);

  function handleExportCSV() {
    const csv = exportToCSV(title, columns);
    downloadFile(csv, `${title}.csv`, "text/csv");
    setOpen(false);
  }

  function handleExportMarkdown() {
    const md = exportToMarkdown(title, columns);
    downloadFile(md, `${title}.md`, "text/markdown");
    setOpen(false);
  }

  return (
    <div ref={containerRef}>
      <Button
        ref={buttonRef}
        onClick={() => setOpen(!open)}
        icon={<DownloadIcon />}
        text="Export"
        aria-expanded={open}
        aria-haspopup="menu"
      />

      {open && (
        <div className="absolute mt-2 bg-white dark:bg-slate-800 rounded shadow-xl/30 p-2 flex flex-col gap-2 w-[180px] -translate-x-1/4 transform text-center border border-slate-400 dark:border-slate-700">
          <Button
            onClick={handleExportCSV}
            variant="text"
            icon={<TableIcon />}
            text="Export CSV"
            className="w-full justify-start"
          />
          <Button
            onClick={handleExportMarkdown}
            variant="text"
            icon={<DocumentIcon />}
            text="Export Markdown"
            className="w-full justify-start"
          />
        </div>
      )}
    </div>
  );
}
