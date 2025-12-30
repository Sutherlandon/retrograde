import { ChileIcon } from "~/images/icons";

export default function Footer() {
  return (
    <footer className="bg-sky-400 flex flex-col gap-4 items-center justify-center py-3 px-2 text-black lg:flex-row lg:justify-between ">
      <section className="flex flex-col gap-4 items-center justify-center py-2 px-4">
        <div className="mx-auto text-center flex gap-4 items-center justify-center">
          <span>Made with </span><ChileIcon size="xl" /><span>in Northern NM</span>
        </div>
      </section>
      <section className="py-2 px-4">
        <a
          href="https://sutherlandon.com"
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          &copy; {new Date().getFullYear()} Sutherlandon, LLC
        </a>
      </section>
      <section className="py-2 px-4">
        <a href="/terms-of-service" className="underline">Terms of Service</a> |&nbsp;
        <a href="/privacy-policy" className="underline">Privacy Policy</a>
      </section>
    </footer>
  );
}