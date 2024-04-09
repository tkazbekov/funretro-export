const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const { exit } = require("process");
const inquirer = require("inquirer");

var [url, file, format, ignoreZeroVotes] = process.argv.slice(2);

async function askForInput() {
  if (!url) {
    ({ url } = await inquirer.prompt([
      {
        type: "input",
        name: "url",
        message: "Board URL:",
        validate: validateUrl,
      },
    ]));
  }
  if (!file) {
    ({ file } = await inquirer.prompt([
      {
        type: "input",
        name: "file",
        message: "Output file path:",
        validate: validateFilePath,
      },
    ]));
  }
  if (!format) {
    ({ format } = await inquirer.prompt([
      {
        type: "list",
        name: "format",
        message: "Export format:",
        choices: ["txt", "csv"],
      },
    ]));
  }
  if (!ignoreZeroVotes) {
    ({ ignoreZeroVotes } = await inquirer.prompt([
      {
        type: "confirm",
        name: "ignoreZeroVotes",
        message: "Ignore items with zero votes?",
      },
    ]));
  }
}

function validateUrl(url) {
  if (!url.trim()) {
    return "URL can't be empty";
  }
  return true;
}

function validateFilePath(filePath) {
  if (!filePath.trim()) {
    return "Path can't be empty";
  }
  return true;
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
          messages: (
            await Promise.all(
              messages.map(async (message) => {
                const text = await message.$eval(
                  ".easy-card-main .easy-card-main-content .text",
                  (node) => node.innerText.trim()
                );
                const votes = parseInt(
                  await message.$eval(
                    ".easy-card-votes-container .easy-badge-votes",
                    (node) => node.innerText.trim()
                  )
                );
                const ignored = ignoreZeroVotes && votes === 0;
                return ignored ? null : { text, votes };
              })
            )
          ).filter(Boolean),
        };
      })
    ),
  };

  await browser.close();

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
  const columnHeaders = board.columns.map((column) => column.name);
  const rows = board.columns.map((column) => column.messages);

  const maxMessages = Math.max(...rows.map((messages) => messages.length));

  let csvContent = columnHeaders.join(",") + "\n";

  for (let i = 0; i < maxMessages; i++) {
    csvContent +=
      rows.map((messages) => `"${messages[i]?.text || ""}"`).join(",") + "\n";
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
      console.log(`Successfully exported to ${resolvedPath}`);
      exit();
    }
  });
}

function handleError(error) {
  throw error;
}

async function main() {
  await askForInput();

  const board = await scrape();
  const data =
    format === "txt" ? formatBoardToText(board) : formatBoardToCsv(board);
  writeToFile(file, data);
}

main().catch(handleError);

