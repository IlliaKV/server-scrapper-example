const express = require("express");
const https = require('https');
const asyncHandler = require('express-async-handler');
const fs = require('fs');

var app = express();
const port = process.env.PORT || 8000;

var pageData = '';
var results = [];
var title = "Amazon Scrapper";
var message = "Hello, here is your Amazon Scrapper!";
var tableResults = "";

app.get("/", (req, res) => {
    res.render('index', {});
    // res.send(text);
    console.log(message);
})

app.get("/scrap/:keyword", asyncHandler(async (req, res) => {
    console.log(">>>>Start scrap:");
    pageData = await scrap(req.params["keyword"]);
    results = getResults(pageData);

    console.log(">>>>Results:");
    for (let result of results) {
        console.log(JSON.stringify(result));
    }

    res.render('index', {});
}));

app.listen(port, async () => {
    console.log("Server has started");
});

app.engine('ntl', function (filePath, options, callback) {
    fs.readFile(filePath, function (err, content) {
        if (err) return callback(new Error(err));
        createTableResults();
        var rendered = content.toString().replace('#title#', '' + title + '').replace('#message#', '' + message + '').replace('#tableResults#', '' + tableResults + '').replace('#pageData#', '' + pageData + '');
        return callback(null, rendered);
    });
});
app.set('views', './views'); // specify the views directory
app.set('view engine', 'ntl'); // register the template engine

const scrap = async function (keyword) {
    let answer = 'none';

    const options = {
        hostname: 'www.amazon.com',
        path: '/s/?keywords=' + keyword,
        method: 'GET',
        headers: {
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.93 Safari/537.36',
            'upgrade-insecure-requests': '1',
            'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9'
        }
    }

    answer = await request(options);
    console.log(answer.data);

    return answer.data;
}

const request = async function (options) {
    return new Promise((resolve, reject) => {
        https.get(options, (resp) => {
            let data = '';

            resp.on('data', (chunk) => {
                data += chunk;
            });

            resp.on('end', () => {
                resolve({ resp, data });
            });

        }).on("error", (err) => {
            console.log("Error: " + err.message);
        })
    });
}

const parseSingle = function (source, rgx) {
    try {
        return source.match(rgx)[1];
    } catch (e) {
        return '';
    }
}

const getResults = function (data) {
    let results = [];
    if (/id="s-results-list/.test(data)) {
        let productsHTML = findProducts(data, 1);
        if (productsHTML && productsHTML.length > 0) {
            for (let productHTML of productsHTML) {
                pushProduct(results, productHTML, 1);
            }
            console.log('>>>>Found ' + (results.length) + ' results');
        }
    } else if (/class="s-result-list/.test(data)) {
        let productsHTML = findProducts(data, 2);

        if (productsHTML && productsHTML.length > 0) {
            let onlyProductsHTML = [];
            for (let productHTML of productsHTML) {
                if (!/a-size-mini a-color-secondary" dir="auto">Sponsored<\/span>/i.test(productHTML) && findTitle(productHTML, 2) != '') {
                    onlyProductsHTML.push(productHTML);
                }
            }
            productsHTML = onlyProductsHTML;

            for (let productHTML of productsHTML) {
                pushProduct(results, productHTML, 2);
            }
            console.log('>>>>Found ' + (results.length) + ' results');
        }
    } else if (/id="noResultsTitle"/.test(data)) {
        console.log('>>>>Results not found');
    }
    return results;
}

const findProducts = function (data, type) {
    if (type == 1) {
        let m = /id="s-results-list-atf"([^]*?)id="pagn"/.exec(data);
        if (m && m[1]) {
            return m[1].match(/<li id="result_\d+"[^]+?s-item-container[^]+?<.+?(?:a-fixed-left-grid|a-spacing-base|a-spacing-small)[^]+?>(?:[^]*?)<\/li>/ig);
        }
    } else if (type == 2) {
        let m = /class="s-result-list (?:s-search-results )?sg-row"([^]*)type="s-pagination"/.exec(data);
        if (m && m[1]) {
            return m[1].match(/s-result-item[^]+?<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*(?:<\/div>|<\/span>)\s*<\/div>\s*<\/div>/g);
        }
    }
    return null;
}

const pushProduct = function (results, data, type) {
    results.push({
        title: findTitle(data, type),
        link: 'https://www.amazon.com' + findLink(data, type)
    });
}

const findLink = function (data, type) {
    if (type == 1) {
        let m;
        return (m = /a class="a-link-normal s-access-detail-page\s+s-color-twister-title-link a-text-normal".+href="([^"]+)">/.exec(data)) ? (m[2] ? decodeURIComponent(m[2]) : m[1]) : '';
    } else if (type == 2) {
        let m;
        return (m = /<h[25][^>]+>\s*<a class="a-link-normal[^>]+href="([^"]+)">/.exec(data)) ? (m[2] ? decodeURIComponent(m[2]) : m[1]) : '';
    }
}

const findTitle = function (data, type) {
    if (type == 1) {
        let m;
        return (m = /h2\s+data-attribute[^>]+>(.+?)<\/h2/.exec(data)) ? m[1].replace(/(<.+?>.+?<\/.+?>)/g, '') : '';
    } else if (type == 2) {
        let m;
        return (m = /<h[25][^>]+>\s*<a[^>]+>\s*<span[^>]*>\s*(.+?)\s*<\/span>/.exec(data)) ? m[1].replace(/(<.+?>.+?<\/.+?>)/g, '') : '';
    }
}

const createTableResults = function () {
    tableResults = '<table>\n'
        + '\r<tr>\n'
        + '\r\r<th></th>\n'
        + '\r\r<th>Title</th>\n'
        + '\r\r<th>Link</th>\n'
        + '\r</tr>\n';
    for (let i in results) {
        tableResults += '\r<tr>\n'
            + `\r\r<th>${i + 1}</th>\n`
            + `\r\r<th>${results[i].title}</th>\n`
            + `\r\r<th>${results[i].link}</th>\n`
            + '\r</tr>\n';
    }
    tableResults += '</table>';
    console.log('>>>>Table Results:\n' + tableResults);
}
