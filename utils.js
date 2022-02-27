const fs = require("fs");

module.exports = {
  cleanUpImages: () => {
    console.log("Cleaning up images");

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
  },
};
