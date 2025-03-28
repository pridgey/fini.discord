import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { pb } from "../../utilities/pocketbase";

// Use puppeteer-extra with stealth plugin to avoid detection
puppeteer.use(StealthPlugin());

export const fetchJobPostings = async () => {
  try {
    const browser = await puppeteer.launch({
      headless: true, // Easier debugging (set to true in production)
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();

    const userAgents = [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 13.5; rv:125.0) Gecko/20100101 Firefox/125.0",
      "Mozilla/5.0 (X11; Linux i686; rv:125.0) Gecko/20100101 Firefox/125.0",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 Edg/124.0.0.0",
      "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1",
      "Mozilla/5.0 (Linux; Android 13; SM-S901U) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36",
    ];

    // Set realistic user agent (keeping to 1 for now as to not create suspicion)
    await page.setUserAgent(
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    );

    // set cookie
    await browser.setCookie({
      name: "li_at",
      value: process.env.COOKIE ?? "",
      domain: process.env.DOMAIN ?? "",
    });

    const url = process.env.URL ?? "";
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

    // Wait for job listings to load
    await page.waitForSelector(".scaffold-layout__list-item", {
      timeout: 30000,
    });

    const jobs = await page.evaluate(() => {
      const items: any[] = [];
      const jobElements = document.querySelectorAll(
        ".scaffold-layout__list-item"
      );

      for (const element of jobElements) {
        items.push({
          title:
            element
              .querySelector(".artdeco-entity-lockup__title strong")
              ?.textContent?.trim() || "No title found",
          subtitle:
            element
              .querySelector(".artdeco-entity-lockup__subtitle span")
              ?.textContent?.trim() || "No subtitle found",
          caption:
            element
              .querySelector(".artdeco-entity-lockup__caption span")
              ?.textContent?.trim() || "No caption found",
          link:
            element
              .querySelector(".artdeco-entity-lockup__title a")
              ?.attributes?.getNamedItem("href")?.value || "No link found",
        });
      }

      return items;
    });

    await browser.close();

    const newJobs = jobs.filter(async (job) => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      // Check if the db already has this job as being seen
      const results = await pb.collection("job_posts").getFullList({
        filter: `title = "${job.title}" && subtitle = "${job.subtitle}"`,
        requestKey: job.link,
      });

      return results.length > 0;
    });

    for (const job of newJobs) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      // Add new jobs to db so they don't get picked up next time
      await pb.collection("job_posts").create(
        {
          title: job.title,
          subtitle: job.subtitle,
          caption: job.caption,
          link: job.link,
        },
        {
          requestKey: `create-${job.link}`,
        }
      );
    }

    return newJobs;
  } catch (err) {
    console.error("Error fetching job postings", err);
    return [];
  }
};
