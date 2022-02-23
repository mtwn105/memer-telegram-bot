const puppeteer = require("puppeteer");

module.exports = {
  fetchMeme: async (searchText) => {
    try {
      const url = "https://imgflip.com/search?q=" + searchText;

      const browser = await puppeteer.launch({ args: ["--no-sandbox"] });
      // const browser = await puppeteer.launch({ headless: true });
      const page = await browser.newPage();
      await page.goto(url);

      await page.click("#s-results > a:nth-child(2)");

      await new Promise((r) => setTimeout(r, 1000));

      let memeExists =
        (await page.$(
          "#base-left > div:nth-child(1) > div.base-img-wrap-wrap > div > a > img"
        )) || null;

      if (memeExists) {
        await page.click(
          "#base-left > div:nth-child(1) > div.base-img-wrap-wrap > div > a"
        );

        await new Promise((r) => setTimeout(r, 2000));

        const issueSrc = await page.evaluate(() => {
          const image = document.querySelector("#im");
          return image.getAttribute("src");
        });

        await browser.close();
        return issueSrc;
      } else {
        await page.click("#base-right > div > a.meme-link");

        await new Promise((r) => setTimeout(r, 2000));

        const issueSrc = await page.evaluate(() => {
          const image = document.querySelector("#mtm-img");
          return image.getAttribute("src");
        });

        await browser.close();
        return issueSrc;
      }
    } catch (err) {
      console.error(err);
      return null;
    }
  },
  fetchMemeTemplate: async (searchText) => {
    try {
      const url = "https://imgflip.com/search?q=" + searchText;

      const browser = await puppeteer.launch({ args: ["--no-sandbox"] });
      // const browser = await puppeteer.launch({ headless: true });
      const page = await browser.newPage();
      await page.goto(url);

      await page.click("#s-results > a:nth-child(2)");

      await new Promise((r) => setTimeout(r, 1000));

      await page.click("#base-right > div > a.meme-link");

      await new Promise((r) => setTimeout(r, 2000));

      const issueSrc = await page.evaluate(() => {
        const image = document.querySelector("#mtm-img");
        return image.getAttribute("src");
      });

      const templateId = await page.evaluate(() => {
        const para = document.querySelector("#mtm-info > p");
        // const para = document.querySelector("#mtm-info > p");
        if (!!para.innerText && para.innerText.startsWith("Template ID")) {
          return para.innerText.split(" ")[2];
        } else {
          return null;
        }
      });

      await browser.close();
      return { image: issueSrc, id: templateId };
    } catch (err) {
      console.error(err);
      return { image: null, id: null };
    }
  },
};
