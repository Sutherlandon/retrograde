import type { LoaderFunctionArgs } from "react-router";

// Ideally, import your database client here
// import { db } from "~/utils/db.server"; 

export async function loader({ request }: LoaderFunctionArgs) {
  const baseUrl = "https://retrograde.sh";

  // 1. Define your static pages manually
  // These are pages that always exist
  const staticPages = [
    { path: "/", priority: "1.0", changefreq: "daily" },
    { path: "/board/example-board", priority: "0.9", changefreq: "monthly" },
    { path: "/about", priority: "0.8", changefreq: "monthly" },
    { path: "/contact", priority: "0.8", changefreq: "monthly" },
    { path: "/terms-of-service", priority: "0.6", changefreq: "monthly" },
    { path: "/privacy-policy", priority: "0.6", changefreq: "monthly" },
  ];

  // 2. Fetch dynamic content (Example: Publicly viewable boards)
  // This is where the "Dynamic" magic happens. 
  // If you add a new board to the DB, it automatically appears here.

  // const boards = await db.board.findMany({ where: { isPublic: true } });

  // 3. Generate the XML string
  const content = `<?xml version="1.0" encoding="UTF-8"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      ${staticPages
      .map((page) => {
        return `
            <url>
              <loc>${baseUrl}${page.path}</loc>
              <priority>${page.priority}</priority>
              <changefreq>${page.changefreq}</changefreq>
            </url>
          `;
      })
      .join("")}
    </urlset>
  `;

  // 4. Return the Response with correct headers
  return new Response(content, {
    status: 200,
    headers: {
      "Content-Type": "application/xml",
      "xml-version": "1.0",
      "encoding": "UTF-8",
      // Optional: Cache this response for 1 hour to save server resources
      "Cache-Control": "public, max-age=3600",
    },
  });
}