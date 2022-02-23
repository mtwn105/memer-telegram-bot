const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios").default;
const fs = require("fs");
const FormData = require("form-data");
const request = require("request");

const { fetchMeme, fetchMemeTemplate } = require("./meme");

require("dotenv").config();

const url = "https://api.imgflip.com/caption_image";

// Create a bot that uses 'polling' to fetch new updates
const bot = new TelegramBot(process.env.TELEGRAM_KEY, { polling: true });

const chats = new Map();

const states = [
  "NONE",
  "CREATE_STARTED",
  "CREATE_TEMPLATE_SEARCH",
  "CREATE_TEMPLATE_YES",
  "CREATE_TEMPLATE_NO",
  "CREATE_TEMPLATE_TOP",
  "CREATE_TEMPLATE_BOTTOM",
  "CREATE_TEMPLATE_FINISHED",
  "CREATE_TEMPLATE_ERROR",
  "CUSTOM_IMAGE_UPLOAD",
  "CUSTOM_IMAGE_TOP",
  "CUSTOM_IMAGE_BOTTOM",
  "CUSTOM_IMAGE_FINISHED",
  "CUSTOM_IMAGE_ERROR",
];

bot.on("polling_error", (error) => {
  console.log("polling_error", error);
});

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, "Welcome to Memer Bot");
  bot.sendMessage(
    msg.chat.id,
    `Hey there ${msg.from.first_name}, I am Memer Bot!

  You can search & create memes using the following commands:

  /search <search-term> - Search for a meme for a term
  /create - Create a meme from a template or custom image
  /reset - Reset the current state of the bot (if not responding)
  `
  );
  chats.set(msg.chat.id, { state: "NONE" });
});

bot.onText(/\/reset/, (msg) => {
  chats.set(msg.chat.id, { state: "NONE" });
  bot.sendMessage(msg.chat.id, "Resetted state");
});

bot.onText(/\/search (.+)/, async (msg, match) => {
  // bot.removeTextListener(/(.*)/);

  // bot.sendMessage(msg.chat.id, "Enter a search term to get a meme");

  const searchText = match[1];

  console.log("searchText", searchText);

  bot.sendMessage(msg.chat.id, "Seaching meme for you...");

  let memeSrc = await fetchMeme(searchText);

  if (memeSrc) {
    console.log("Got Search " + memeSrc);

    if (memeSrc.substring(0, 2) === "//") {
      memeSrc = "http://" + memeSrc.substring(2);
    } else {
      memeSrc = "https://imgflip.com" + memeSrc;
    }

    bot.sendMessage(
      msg.chat.id,
      `${msg.from.first_name}, Here is your meme 👇`
    );
    bot.sendPhoto(msg.chat.id, memeSrc);
    // bot.removeTextListener(/(.*)/);
  } else {
    bot.sendMessage(
      msg.chat.id,
      "Sorry " + msg.from.first_name + ", I couldn't find a meme for you 😢"
    );
  }
});

bot.onText(/\/create/, (msg) => {
  // bot.removeTextListener(/(.*)/);

  bot.sendMessage(
    msg.chat.id,
    "Choose do you want to create a meme from a template or custom image",

    {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "Template",
              callback_data: "TEMPLATE_TYPE",
            },
            {
              text: "Custom Image",
              callback_data: "CUSTOM_TYPE",
            },
          ],
        ],
      },
    }
  );

  chats.set(msg.chat.id, { state: "CREATE_STARTED" });
});

// Handle callback queries
bot.on("callback_query", (callbackQuery) => {
  const action = callbackQuery.data;
  const msg = callbackQuery.message;

  console.log(action);

  if (action == "TEMPLATE_TYPE") {
    bot.sendMessage(
      msg.chat.id,
      "Please enter a search term to get a meme template"
    );

    chats.set(msg.chat.id, { state: "CREATE_TEMPLATE_SEARCH" });
  } else if (action.includes("TEMPLATE_YES")) {
    let templateId = action.split(" ")[2];

    console.log("templateId", templateId);

    bot.sendMessage(msg.chat.id, "Glad you liked it!");

    bot.sendMessage(msg.chat.id, "Please enter a top text (send . to skip)");
    chats.set(msg.chat.id, {
      state: "CREATE_TEMPLATE_TOP",
      templateId: templateId,
    });
  } else if (action == "TEMPLATE_NO") {
    bot.sendMessage(
      msg.chat.id,
      "Oops, let's try again by entering a different search term again."
    );
    chats.set(msg.chat.id, { state: "CREATE_TEMPLATE_SEARCH" });
    // bot.removeTextListener(/(.*)/);
  } else if (action == "CUSTOM_TYPE") {
    bot.sendMessage(
      msg.chat.id,
      "Please send me a photo to create a meme from"
    );

    chats.set(msg.chat.id, { state: "CREATE_CUSTOM_IMAGE_UPLOAD" });
  }
});

bot.onText(/(.*)/, async (msg, match) => {
  if (
    chats.get(msg.chat.id) &&
    chats.get(msg.chat.id).state === "CREATE_TEMPLATE_SEARCH"
  ) {
    const searchText = match[0];

    console.log("searchText", searchText);

    bot.sendMessage(msg.chat.id, "Seaching meme template for you...");

    let { image, id } = await fetchMemeTemplate(searchText);

    if (image && id) {
      console.log("Got Search " + image);
      if (image.substring(0, 2) === "//") {
        image = "http://" + image.substring(2);
      } else {
        image = "https://imgflip.com" + image;
      }

      bot.sendMessage(
        msg.chat.id,
        `${msg.from.first_name}, Here is your meme template 👇`
      );
      bot.sendPhoto(msg.chat.id, image);
      bot.sendMessage(msg.chat.id, "Do you like this one?", {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "Yes",
                callback_data: "TEMPLATE_YES ID: " + id,
              },
              {
                text: "No",
                callback_data: "TEMPLATE_NO",
              },
            ],
          ],
        },
      });
      // bot.removeTextListener(/(.*)/);

      chats.set(msg.chat.id, { state: "CREATE_TEMPLATE_YES" });
    } else {
      bot.sendMessage(
        msg.chat.id,
        "Sorry " +
          msg.from.first_name +
          ", I couldn't find a meme template for you 😢. Please enter some other search term"
      );
      // bot.removeTextListener(/(.*)/);
      // chats.set(msg.chat.id, { state: "CREATE_TEMPLATE_SEARCH" });
    }
  } else if (
    chats.get(msg.chat.id) &&
    chats.get(msg.chat.id).state === "CREATE_TEMPLATE_TOP"
  ) {
    const text = match[0];

    console.log("topText", text);

    let topText = "";

    if (text === ".") {
    } else {
      topText = text;
    }
    bot.sendMessage(msg.chat.id, "Please enter a bottom text (send . to skip)");

    chats.set(msg.chat.id, {
      state: "CREATE_TEMPLATE_BOTTOM",
      templateId: chats.get(msg.chat.id).templateId,
      topText: topText,
    });
  } else if (
    chats.get(msg.chat.id) &&
    chats.get(msg.chat.id).state === "CREATE_TEMPLATE_BOTTOM"
  ) {
    const text = match[0];

    console.log("bottomText", text);

    let bottomText = "";

    if (text === ".") {
    } else {
      bottomText = text;
    }

    bot.sendMessage(
      msg.chat.id,
      `
      Top Text is ${
        chats.get(msg.chat.id).topText === ""
          ? "None"
          : chats.get(msg.chat.id).topText
      } \nBottom Text is ${bottomText === "" ? "None" : bottomText}
     `
    );

    // Generate meme
    const response = await axios.post(
      url,
      new URLSearchParams(
        {
          template_id: chats.get(msg.chat.id).templateId,
          username: process.env.IMGFLIP_USERNAME,
          password: process.env.IMGFLIP_PASSWORD,
          text0: chats.get(msg.chat.id).topText,
          text1: bottomText,
        },
        {
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        }
      )
    );

    if (
      response.status == 200 &&
      !!response.data &&
      response.data.success &&
      response.data.data.url
    ) {
      bot.sendMessage(msg.chat.id, `Here is your meme 👇`);
      bot.sendPhoto(msg.chat.id, response.data.data.url);

      chats.set(msg.chat.id, { state: "CREATE_TEMPLATE_FINISHED" });

      // If you like it do share this bot with your friends
      // Also follow developer Amit Wani on Twitter @mtwn105
      bot.sendMessage(
        msg.chat.id,
        "Do you like this meme? Share it with your friends and follow me @mtwn105 on Twitter for more cool bots 😉",
        {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "@mtwn105",
                  url: "https://twitter.com/mtwn105",
                },
              ],
            ],
          },
        }
      );
    } else {
      bot.sendMessage(
        msg.chat.id,
        `Sorry ${msg.from.first_name}, There was some error & I couldn't generate a meme for you 😢. Please try again 🥺`
      );
      // bot.removeTextListener(/(.*)/);
      chats.set(msg.chat.id, { state: "CREATE_TEMPLATE_FINISHED" });
    }
  } else if (
    chats.get(msg.chat.id) &&
    chats.get(msg.chat.id).state === "CREATE_CUSTOM_IMAGE_TOP"
  ) {
    const text = match[0];

    console.log("topText", text);

    let topText = "";

    if (text === ".") {
    } else {
      topText = text;
    }
    bot.sendMessage(msg.chat.id, "Please enter a bottom text (send . to skip)");

    chats.set(msg.chat.id, {
      state: "CREATE_CUSTOM_IMAGE_BOTTOM",
      image: chats.get(msg.chat.id).image,
      topText: topText,
    });
  } else if (
    chats.get(msg.chat.id) &&
    chats.get(msg.chat.id).state === "CREATE_CUSTOM_IMAGE_BOTTOM"
  ) {
    const text = match[0];

    console.log("bottomText", text);

    let bottomText = "";

    if (text === ".") {
    } else {
      bottomText = text;
    }

    bot.sendMessage(
      msg.chat.id,
      `
      Top Text is ${
        chats.get(msg.chat.id).topText === ""
          ? "None"
          : chats.get(msg.chat.id).topText
      } \nBottom Text is ${bottomText === "" ? "None" : bottomText}
     `
    );

    bot.sendMessage(msg.chat.id, `Generating meme please wait...`);

    // Get image
    const image = chats.get(msg.chat.id).image;

    // Get image file from telegram using file_id
    const imagePath = await bot.downloadFile(image, "./images");

    let file = fs.readFileSync(imagePath);

    // Rename file to random string
    const fileName = `${Math.random()
      .toString(36)
      .substring(2, 15)}${Math.random().toString(36).substring(2, 15)}.jpg`;

    console.log("File name", fileName);

    // Write file to disk
    fs.writeFileSync(`./images/${fileName}`, file);

    // file = fs.createReadStream(`./images/${fileName}`);

    const uploadData = new FormData();
    uploadData.append("image", fs.createReadStream(`./images/${fileName}`));
    uploadData.append("content-type", "application/octet-stream");

    const options = {
      method: "POST",
      url: "https://ronreiter-meme-generator.p.rapidapi.com/images",
      headers: {
        "x-rapidapi-host": "ronreiter-meme-generator.p.rapidapi.com",
        "x-rapidapi-key": process.env.RAPID_API_KEY,
        ...uploadData.getHeaders(),
        useQueryString: true,
      },
      formData: {
        image: {
          value: fs.createReadStream(`./images/${fileName}`),
          options: {
            filename: fileName,
            contentType: "application/octet-stream",
          },
        },
      },
    };

    request(options, async (error, response, body) => {
      if (error) {
        bot.sendMessage(
          msg.chat.id,
          `Sorry ${msg.from.first_name}, There was some error & I couldn't generate a meme for you 😢. Please try again 🥺`
        );
      } else {
        const response = JSON.parse(body);

        if (response.status == "success" && !!response.name) {
          // Generate Meme

          try {
            const res = await axios.get(
              "https://ronreiter-meme-generator.p.rapidapi.com/meme",
              {
                headers: {
                  "x-rapidapi-host": "ronreiter-meme-generator.p.rapidapi.com",
                  "x-rapidapi-key": process.env.RAPID_API_KEY,
                },
                params: {
                  meme: response.name,
                  top: chats.get(msg.chat.id).topText,
                  bottom: bottomText,
                },
                responseType: "arraybuffer",
              }
            );

            fs.writeFileSync(
              `./images/meme_${fileName}`,
              Buffer.from(res.data),
              "binary"
            );

            // Send meme to user
            bot.sendMessage(msg.chat.id, `Here is your meme 👇`);
            bot.sendPhoto(msg.chat.id, `./images/meme_${fileName}`);
            chats.set(msg.chat.id, { state: "CREATE_TEMPLATE_FINISHED" });

            // If you like it do share this bot with your friends
            // Also follow developer Amit Wani on Twitter @mtwn105
            bot.sendMessage(
              msg.chat.id,
              "Do you like this meme? Share it with your friends and follow me @mtwn105 on Twitter for more cool bots 😉",
              {
                reply_markup: {
                  inline_keyboard: [
                    [
                      {
                        text: "@mtwn105",
                        url: "https://twitter.com/mtwn105",
                      },
                    ],
                  ],
                },
              }
            );
            // Delete image from disk
            // cleanUpImages(fileName, msg);

            // Delete image files
          } catch (err) {
            console.log(err);
            bot.sendMessage(
              msg.chat.id,
              `Sorry ${msg.from.first_name}, There was some error & I couldn't generate a meme for you 😢. Please try again 🥺`
            );
            chats.set(msg.chat.id, { state: "CREATE_TEMPLATE_FINISHED" });
            // Delete image from disk
            // cleanUpImages(fileName, msg);
          }
        } else {
          bot.sendMessage(
            msg.chat.id,
            `Sorry ${msg.from.first_name}, There was some error & I couldn't generate a meme for you 😢. Please try again 🥺`
          );
          chats.set(msg.chat.id, { state: "CREATE_TEMPLATE_FINISHED" });
          // Delete image from disk
          // cleanUpImages(fileName, msg);
        }
      }
    });
  }
});

bot.on("photo", async (msg) => {
  if (
    chats.get(msg.chat.id) &&
    chats.get(msg.chat.id).state === "CREATE_CUSTOM_IMAGE_UPLOAD"
  ) {
    bot.sendMessage(msg.chat.id, "Awesome!, Looking good!");

    bot.sendMessage(msg.chat.id, "Please send me a top text (send . to skip)");

    chats.set(msg.chat.id, {
      state: "CREATE_CUSTOM_IMAGE_TOP",
      image: msg.photo[msg.photo.length - 1].file_id,
    });
  }
});

createImageDirectory = () => {
  if (!fs.existsSync("./images")) {
    fs.mkdirSync("./images");
  }
};

createImageDirectory();

setInterval(() => cleanUpImages(), 1000);

function cleanUpImages() {
  // Delete files which are 5 minutes old in images folder
  fs.readdir("./images", (err, files) => {
    if (err) {
      console.log(err);
    } else {
      files.forEach((file) => {
        const filePath = `./images/${file}`;

        fs.stat(filePath, (err, stats) => {
          if (err) {
            console.log(err);
          } else {
            if (stats.isFile()) {
              const fileDate = new Date(stats.birthtime);
              const now = new Date();
              const diff = now - fileDate;

              if (diff > 300000) {
                fs.unlink(filePath, (err) => {
                  if (err) {
                    console.log(err);
                  } else {
                    console.log(`${file} deleted`);
                  }
                });
              }
            }
          }
        });
      });
    }
  });
}
