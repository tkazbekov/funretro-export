const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const { exit } = require("process");
const { stringify } = require("querystring");

const [url, file] = process.argv.slice(2);

if (!url) {
  throw "Please provide a URL as the first argument.";
}

async function scrape() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto(url);
  await page.waitForSelector(".easy-card-list");

  const boardName = await page.$eval(".board-name", (node) =>
    node.innerText.trim()
  );
  const columnElements = await page.$$(".easy-card-list");

  const board = {
    name: boardName,
    columns: await Promise.all(
      columnElements.map(async (column) => {
        const columnName = await column.$eval(".column-header", (node) =>
          node.innerText.trim()
        );
        const messages = await column.$$(".easy-board-front");

        return {
          name: columnName,
          messages: await Promise.all(
            messages.map(async (message) => {
              const text = await message.$eval(
                ".easy-card-main .easy-card-main-content .text",
                (node) => node.innerText.trim()
              );
              const votes = await message.$eval(
                ".easy-card-votes-container .easy-badge-votes",
                (node) => node.innerText.trim()
              );

              return { text, votes };
            })
          ),
        };
      })
    ),
  };

  return board;
}

function formatBoardToText(board) {
  return [
    board.name,
    ...board.columns.flatMap((column) => [
      `${column.name}:`,
      ...column.messages.map(({ text, votes }) => `${text} (${votes})`),
      "",
    ]),
  ].join("\n");
}

function formatBoardToCsv(board) {
  const columnHeaders = board.columns.map(column => column.name);
  const rows = board.columns.map(column => column.messages);

  const maxMessages = Math.max(...rows.map(messages => messages.length));

  let csvContent = columnHeaders.join(",") + "\n";

  for (let i = 0; i < maxMessages; i++) {
    csvContent += rows
      .map(messages => `"${messages[i]?.text || ""}"`)
      .join(",") + "\n";
  }

  return csvContent;
}


function writeToFile(filePath, data) {
  const resolvedPath = path.resolve(
    filePath || `../${data.split("\n")[0].replace("/", "")}.txt`
  );
  fs.writeFile(resolvedPath, data, (error) => {
    if (error) {
      throw error;
    } else {
      console.log(`Successfully written to file at: ${resolvedPath}`);
    }
    process.exit();
  });
}

function handleError(error) {
  console.error(error);
}

console.log(`Exporting "${url}" to "${file}"...`);
scrape().then((data) => writeToFile(file, formatBoardToCsv(data)));
