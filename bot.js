const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios").default;
const fs = require("fs");
const FormData = require("form-data");
const request = require("request");
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const helmet = require("helmet");

const { fetchMeme, fetchMemeTemplate } = require("./meme");
const { sendLogs } = require("./log");
const { connectToRedis } = require("./redis");

require("dotenv").config();

let client = null;

const url = "https://api.imgflip.com/caption_image";

const bot = new TelegramBot(process.env.TELEGRAM_KEY);

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

bot.setWebHook(process.env.APP_URL + "/bot" + process.env.TELEGRAM_KEY);

const app = express();

const port = process.env.PORT || 3000;

// parse the updates to JSON
app.use(express.json());

app.use(cors());
app.use(helmet());
app.use(morgan("combined"));

// We are receiving updates at the route below!
app.post(`/bot${process.env.TELEGRAM_KEY}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// Send a message to all people who have started the bot
app.post(`/message`, async (req, res) => {
  const { token, message } = req.body;

  if (token !== process.env.TELEGRAM_KEY) {
    res.status(401).send("Unauthorized");
    return;
  }

  if (!message || message.length == 0) {
    res.status(400).send("Bad request");
    return;
  }

  try {
    const keys = await client.keys("*");

    console.log("Sending message to ", keys.length, " people");

    for (const chatId of keys) {
      console.log("sending msg to", chatId);
      bot.sendMessage(chatId, message);
    }

    res.status(200).send("OK");
  } catch (err) {
    console.log("Error while sending message");
    res.status(500).json(err);
    return;
  }
});

// Start Express Server
app.listen(port, async () => {
  console.log(`Memer bot server is listening on ${port}`);
  client = await connectToRedis();
  setInterval(() => cleanUpImages(), 300000);
});

bot.on("error", (err) => {
  console.log("Some error occured", err);
});

bot.onText(/\/message (.+)/, async (msg, match) => {
  const message = match[1];

  if (msg.chat.id == process.env.MY_CHAT_ID) {
    try {
      const keys = await client.keys("*");

      console.log("Sending message to ", keys.length, " people");

      let success = 0;

      for (const chatId of keys) {
        console.log("sending msg to", chatId);
        try {
          bot.sendMessage(chatId, message);
          success++;
        } catch (err) {
          console.log("Error while sending message", err);
        }
      }

      console.log(
        "Successfully sent message to ",
        success + "/" + keys.length + " people"
      );
    } catch (err) {
      console.log("Error while sending message");
      bot.sendMessage(msg.chat.id, "Error while sending message ");
      return;
    }
  }
});

bot.onText(/\/start/, async (msg) => {
  bot.sendMessage(msg.chat.id, "Welcome to Memer Bot");
  bot.sendMessage(
    msg.chat.id,
    `Hey there ${msg.from.first_name}, I am Memer Bot!

  You can search & create memes using the following commands:

  /search <phrase> - Search for a meme for a word/phrase
  /create - Create a meme from a template or custom image
  /reset - Reset the current state of the bot (if not responding)
  `
  );
  await client.set(msg.chat.id, JSON.stringify({ state: "NONE" }));

  // Send Logs
  sendLogs(
    {
      Event: "Welcome",
      User: msg.chat.username,
    },
    "memer_welcome"
  );
});

// Reply to hey, hi, hello
bot.onText(/^hi$|^hey$|^hello$/i, async (msg) => {
  bot.sendMessage(
    msg.chat.id,
    `Hey there ${msg.from.first_name}, I am Memer Bot!

  You can search & create memes using the following commands:

  /search <search-term> - Search for a meme for a term
  /create - Create a meme from a template or custom image
  /reset - Reset the current state of the bot (if not responding)
  `
  );
  await client.set(msg.chat.id, JSON.stringify({ state: "NONE" }));

  // const value = await client.get(msg.chat.id);

  // console.log(value);

  // Send Logs
  sendLogs(
    {
      Event: "Welcome",
      User: msg.chat.username,
    },
    "memer_welcome"
  );
});

bot.onText(/\/reset/, async (msg) => {
  await client.set(msg.chat.id, JSON.stringify({ state: "NONE" }));
  bot.sendMessage(msg.chat.id, "Resetted state");
});

bot.onText(/^\/search$/, async (msg) => {
  await client.set(msg.chat.id, JSON.stringify({ state: "NONE" }));
  bot.sendMessage(msg.chat.id, "Send search term like /search <search-term>");
});

bot.onText(/\/search (.+)/, async (msg, match) => {
  await client.set(msg.chat.id, JSON.stringify({ state: "NONE" }));

  const searchText = match[1];

  // Send Logs
  sendLogs(
    {
      Event: "Search Meme Request",
      Search: searchText,
      User: msg.chat.username,
    },
    "memer_search"
  );

  console.log("searchText", searchText);

  bot.sendMessage(msg.chat.id, "Seaching meme for you...");

  let memeSrcs = await fetchMeme(searchText);

  if (memeSrcs && memeSrcs.length > 0) {
    console.log("Got Search " + memeSrcs);

    bot.sendMessage(
      msg.chat.id,
      `${msg.from.first_name}, Here are some top memes I found 👇`
    );

    for (let memeSrc of memeSrcs) {
      if (memeSrc.substring(0, 2) === "//") {
        memeSrc = "http://" + memeSrc.substring(2);
      } else {
        memeSrc = "https://imgflip.com" + memeSrc;
      }

      bot.sendPhoto(msg.chat.id, memeSrc);
    }

    // Send Logs
    sendLogs(
      {
        Event: "Search Meme Processed",
        Search: searchText,
        Status: "Success",
        User: msg.chat.username,
      },
      "memer_search"
    );
  } else {
    bot.sendMessage(
      msg.chat.id,
      "Sorry " + msg.from.first_name + ", I couldn't find a meme for you 😢"
    );
    // Send Logs
    sendLogs(
      {
        Event: "Search Meme Processed",
        Search: searchText,
        Status: "Error",
        User: msg.chat.username,
      },
      "memer_search"
    );
  }
});

bot.onText(/\/create/, async (msg) => {
  await client.set(msg.chat.id, JSON.stringify({ state: "NONE" }));

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

  await client.set(msg.chat.id, JSON.stringify({ state: "CREATE_STARTED" }));
});

// Handle callback queries
bot.on("callback_query", async (callbackQuery) => {
  const action = callbackQuery.data;
  const msg = callbackQuery.message;

  console.log(action);

  if (action == "TEMPLATE_TYPE") {
    // Send Logs
    sendLogs(
      {
        Event: "Create Meme Started",
        Type: "Template",
        User: msg.chat.username,
      },
      "memer_create"
    );

    bot.sendMessage(
      msg.chat.id,
      "Please enter a search term to get a meme template"
    );

    await client.set(
      msg.chat.id,
      JSON.stringify({ state: "CREATE_TEMPLATE_SEARCH" })
    );
  } else if (action.includes("TEMPLATE_YES")) {
    let templateId = action.split(" ")[2];

    const chatDataString = await client.get(msg.chat.id);

    const chatData = chatDataString ? JSON.parse(chatDataString) : null;

    const tempMsgMap = chatData.tempMsgMap;

    if (
      tempMsgMap &&
      tempMsgMap.find((m) => m.templateId == templateId) &&
      tempMsgMap.find((m) => m.templateId == templateId).messageId
    ) {
      console.log("templateId", templateId);

      bot.sendMessage(msg.chat.id, "Great, You have a great choice!", {
        reply_to_message_id: tempMsgMap.find((m) => m.templateId == templateId)
          .messageId,
      });

      bot.sendMessage(msg.chat.id, "Please enter a top text (send . to skip)");
      await client.set(
        msg.chat.id,
        JSON.stringify({
          ...chatData,
          state: "CREATE_TEMPLATE_TOP",
          templateId: templateId,
        })
      );
    }
  } else if (action == "CUSTOM_TYPE") {
    // Send Logs
    sendLogs(
      {
        Event: "Create Meme Started",
        Type: "Custom",
        User: msg.chat.username,
      },
      "memer_create"
    );

    bot.sendMessage(
      msg.chat.id,
      "Please send me a photo to create a meme from"
    );

    await client.set(
      msg.chat.id,
      JSON.stringify({ state: "CREATE_CUSTOM_IMAGE_UPLOAD" })
    );
  }
});

bot.onText(/(.*)/, async (msg, match) => {
  try {
    const chatDataString = await client.get(msg.chat.id);
    const chatData = chatDataString ? JSON.parse(chatDataString) : null;

    if (chatData && chatData.state === "CREATE_TEMPLATE_SEARCH") {
      const searchText = match[0];

      console.log("searchText", searchText);

      bot.sendMessage(msg.chat.id, "Seaching meme template for you...");

      const memeTemplates = await fetchMemeTemplate(searchText);

      if (!!memeTemplates && memeTemplates.length > 0) {
        bot.sendMessage(
          msg.chat.id,
          `${msg.from.first_name}, Here are some meme templates from which you can choose 👇`
        );

        bot.sendMessage(
          msg.chat.id,
          `Select any one which you want to use by clicking "Select" button below each image`
        );

        const tempMsgMap = [];

        for (let memeTemplate of memeTemplates) {
          let { image, id } = memeTemplate;

          if (image && id) {
            console.log("Got Search " + image);
            if (image.substring(0, 2) === "//") {
              image = "http://" + image.substring(2);
            } else {
              image = "https://imgflip.com" + image;
            }

            const message = await bot.sendPhoto(msg.chat.id, image, {
              reply_markup: {
                inline_keyboard: [
                  [
                    {
                      text: "Select",
                      callback_data: "TEMPLATE_YES ID: " + id,
                    },
                  ],
                ],
              },
            });

            console.log(message);

            if (message)
              tempMsgMap.push({
                templateId: id,
                messageId: message.message_id,
              });

            // bot.sendMessage(msg.chat.id, "Do you like this one?", {
            //   reply_markup: {
            //     inline_keyboard: [
            //       [
            //         {
            //           text: "Yes",
            //           callback_data: "TEMPLATE_YES ID: " + id,
            //         },
            //         {
            //           text: "No",
            //           callback_data: "TEMPLATE_NO",
            //         },
            //       ],
            //     ],
            //   },
            // });
          }
        }

        await client.set(
          msg.chat.id,
          JSON.stringify({ state: "CREATE_TEMPLATE_YES", tempMsgMap })
        );
      } else {
        bot.sendMessage(
          msg.chat.id,
          "Sorry " +
            msg.from.first_name +
            ", I couldn't find a meme template for you 😢. Please enter some other search term"
        );
        // bot.removeTextListener(/(.*)/);
        // await client.set(msg.chat.id, JSON.stringify({ state: "CREATE_TEMPLATE_SEARCH" }));
      }
    } else if (chatData && chatData.state === "CREATE_TEMPLATE_TOP") {
      const text = match[0];

      console.log("topText", text);

      let topText = "";

      if (text === ".") {
      } else {
        topText = text;
      }
      bot.sendMessage(
        msg.chat.id,
        "Please enter a bottom text (send . to skip)"
      );

      await client.set(
        msg.chat.id,
        JSON.stringify({
          state: "CREATE_TEMPLATE_BOTTOM",
          templateId: chatData.templateId,
          topText: topText,
        })
      );
    } else if (chatData && chatData.state === "CREATE_TEMPLATE_BOTTOM") {
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
        chatData.topText === "" ? "None" : chatData.topText
      } \nBottom Text is ${bottomText === "" ? "None" : bottomText}
     `
      );

      // Generate meme
      const response = await axios.post(
        url,
        new URLSearchParams(
          {
            template_id: chatData.templateId,
            username: process.env.IMGFLIP_USERNAME,
            password: process.env.IMGFLIP_PASSWORD,
            text0: chatData.topText,
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

        await client.set(
          msg.chat.id,
          JSON.stringify({ state: "CREATE_TEMPLATE_FINISHED" })
        );

        // If you like it do share this bot with your friends
        // Also follow developer Amit Wani on Twitter @mtwn105
        bot.sendMessage(
          msg.chat.id,
          "Do you like this meme? Share it with your friends and follow me @mtwn105 on Twitter for more cool stuff 😉. If you want to support me, consider clicking the button below 👇",
          {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "@mtwn105",
                    url: "https://twitter.com/mtwn105",
                  },
                  {
                    text: "Support",
                    url: "https://rzp.io/l/dQtgHoQ6",
                  },
                ],
              ],
            },
          }
        );

        // Send Logs
        sendLogs(
          {
            Event: "Create Meme Processed",
            Status: "Success",
            Type: "Template",
            User: msg.chat.username,
          },
          "memer_create"
        );
      } else {
        bot.sendMessage(
          msg.chat.id,
          `Sorry ${msg.from.first_name}, There was some error & I couldn't generate a meme for you 😢. Please try again 🥺`
        );

        await client.set(
          msg.chat.id,
          JSON.stringify({ state: "CREATE_TEMPLATE_FINISHED" })
        );

        // Send Logs
        sendLogs(
          {
            Event: "Create Meme Processed",
            Status: "Error",
            Type: "Template",
            User: msg.chat.username,
          },
          "memer_create"
        );
      }
    } else if (chatData && chatData.state === "CREATE_CUSTOM_IMAGE_TOP") {
      const text = match[0];

      console.log("topText", text);

      let topText = "";

      if (text === ".") {
      } else {
        topText = text;
      }
      bot.sendMessage(
        msg.chat.id,
        "Please enter a bottom text (send . to skip)"
      );

      await client.set(
        msg.chat.id,
        JSON.stringify({
          state: "CREATE_CUSTOM_IMAGE_BOTTOM",
          image: chatData.image,
          topText: topText,
        })
      );
    } else if (chatData && chatData.state === "CREATE_CUSTOM_IMAGE_BOTTOM") {
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
        chatData.topText === "" ? "None" : chatData.topText
      } \nBottom Text is ${bottomText === "" ? "None" : bottomText}
     `
      );

      bot.sendMessage(msg.chat.id, `Generating meme please wait...`);

      await generateCustomMeme(msg, bottomText);
    } else if (
      msg.text === "/start" &&
      msg.text === "/help" &&
      msg.text === "/search" &&
      msg.text === "/create" &&
      msg.text === "hi" &&
      msg.text === "hey" &&
      msg.text === "hello"
    ) {
      // await client.set(msg.chat.id, JSON.stringify({ state: "NONE" }));

      // Tell user I can't understand this and show help
      bot.sendMessage(
        msg.chat.id,
        "Sorry " +
          msg.from.first_name +
          ", I couldn't understand your message 😢. \n" +
          `You can search & create memes using the following commands:

  /search <search-term> - Search for a meme for a term
  /create - Create a meme from a template or custom image
  /reset - Reset the current state of the bot (if not responding)`
      );
    }
  } catch (err) {
    console.log("Error occurred ", err);

    bot.sendMessage(
      msg.chat.id,
      `Sorry ${msg.from.first_name}, There was some error & I couldn't help you 😢. Please try again 🥺`
    );
    await client.set(
      msg.chat.id,
      JSON.stringify({ state: "CREATE_TEMPLATE_FINISHED" })
    );

    // Send Logs
    sendLogs(
      {
        Event: "Create Meme Processed",
        Status: "Error",
        Type: "Custom",
        User: msg.chat.username,
      },
      "memer_create"
    );
  }
});

bot.on("photo", async (msg) => {
  const chatDataString = await client.get(msg.chat.id);
  const chatData = chatDataString ? JSON.parse(chatDataString) : null;

  if (chatData && chatData.state === "CREATE_CUSTOM_IMAGE_UPLOAD") {
    bot.sendMessage(msg.chat.id, "Awesome!, Looking good!");

    bot.sendMessage(msg.chat.id, "Please send me a top text (send . to skip)");

    await client.set(
      msg.chat.id,
      JSON.stringify({
        state: "CREATE_CUSTOM_IMAGE_TOP",
        image: msg.photo[msg.photo.length - 1].file_id,
      })
    );
  }
});

bot.on("message", async (msg) => {
  if (
    msg.chat.id == process.env.MY_CHAT_ID &&
    !!msg.caption &&
    msg.caption.includes("/message") &&
    (!!msg.photo || !!msg.video || !!msg.animation)
  ) {
    console.log("Message received from my chat id");
    console.log(msg);

    try {
      const keys = await client.keys("*");

      console.log("Sending message to ", keys.length, " people");

      let success = 0;

      for (const chatId of keys) {
        console.log("sending msg to", chatId);

        try {
          if (!!msg.photo) {
            bot.sendPhoto(chatId, msg.photo[msg.photo.length - 1].file_id);
          } else if (!!msg.video) {
            bot.sendVideo(chatId, msg.video.file_id);
          } else if (!!msg.animation) {
            bot.sendAnimation(chatId, msg.animation.file_id);
          }

          success++;
        } catch (err) {
          console.log("Failed to send message to ", chatId);
        }

        bot.sendMessage(
          msg.chat.id,
          "Sent messages successfully to " +
            success +
            "/" +
            keys.length +
            " people"
        );
      }
    } catch (err) {
      console.log("Error while sending message");
      bot.sendMessage(msg.chat.id, "Error while sending message ");
      return;
    }
  }
});

generateCustomMeme = async (msg, bottomText) => {
  let stream = null;

  try {
    const chatDataString = await client.get(msg.chat.id);
    const chatData = chatDataString ? JSON.parse(chatDataString) : null;

    // Get image
    const image = chatData.image;

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

    stream = fs.createReadStream(`./images/${fileName}`);
    const uploadData = new FormData();
    uploadData.append("image", stream);
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
          value: stream,
          options: {
            filename: fileName,
            contentType: "application/octet-stream",
          },
        },
      },
    };

    request(options, async (error, response, body) => {
      stream.close();

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
                  top: chatData.topText,
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
            await client.set(
              msg.chat.id,
              JSON.stringify({ state: "CREATE_TEMPLATE_FINISHED" })
            );

            // If you like it do share this bot with your friends
            // Also follow developer Amit Wani on Twitter @mtwn105
            bot.sendMessage(
              msg.chat.id,
              "Do you like this meme? Share it with your friends and follow me @mtwn105 on Twitter for more cool stuff 😉. If you want to support me, consider clicking the button below 👇",
              {
                reply_markup: {
                  inline_keyboard: [
                    [
                      {
                        text: "@mtwn105",
                        url: "https://twitter.com/mtwn105",
                      },
                      {
                        text: "Support",
                        url: "https://rzp.io/l/dQtgHoQ6",
                      },
                    ],
                  ],
                },
              }
            );

            // Send Logs
            sendLogs(
              {
                Event: "Create Meme Processed",
                Status: "Success",
                Type: "Custom",
                User: msg.chat.username,
              },
              "memer_create"
            );
          } catch (err) {
            console.log(err);
            bot.sendMessage(
              msg.chat.id,
              `Sorry ${msg.from.first_name}, There was some error & I couldn't generate a meme for you 😢. Please try again 🥺`
            );
            await client.set(
              msg.chat.id,
              JSON.stringify({ state: "CREATE_TEMPLATE_FINISHED" })
            );

            // Send Logs
            sendLogs(
              {
                Event: "Create Meme Processed",
                Status: "Error",
                Type: "Custom",
                User: msg.chat.username,
              },
              "memer_create"
            );
          }
        } else {
          bot.sendMessage(
            msg.chat.id,
            `Sorry ${msg.from.first_name}, There was some error & I couldn't generate a meme for you 😢. Please try again 🥺`
          );
          await client.set(
            msg.chat.id,
            JSON.stringify({ state: "CREATE_TEMPLATE_FINISHED" })
          );
          // Send Logs
          sendLogs(
            {
              Event: "Create Meme Processed",
              Status: "Error",
              Type: "Custom",
              User: msg.chat.username,
            },
            "memer_create"
          );
        }
      }
    });
  } catch (err) {
    console.log("Error occured while creating custom meme: ", err);

    bot.sendMessage(
      msg.chat.id,
      `Sorry ${msg.from.first_name}, There was some error & I couldn't generate a meme for you 😢. Please try again 🥺`
    );
    await client.set(
      msg.chat.id,
      JSON.stringify({ state: "CREATE_TEMPLATE_FINISHED" })
    );

    // Send Logs
    sendLogs(
      {
        Event: "Create Meme Processed",
        Status: "Error",
        Type: "Custom",
        User: msg.chat.username,
      },
      "memer_create"
    );

    throw err;
  }
};

cleanUpImages = () => {
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
};
