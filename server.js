const express = require("express");
const https = require('https');
const asyncHandler = require('express-async-handler');
const fs = require('fs');
const axios = require('axios');
const mysql = require('mysql');
const Auth = require('./auth'); // custom js class in root of the project for stashing auth data

let auth = new Auth();

var app = express();
const port = process.env.PORT || 8000;

var pageData = '';
var results = [];
var title = "Amazon Scrapper";
var message = "Hello, here is your Amazon Scrapper!";
var tableResults = "";

const connection = mysql.createConnection(process.env.DATABASE_URL || {
    host: auth.host,
    user: auth.user,
    password: auth.password,
    database: auth.database,
    ssl: {
        ca: fs.readFileSync('cacert-2021-10-26.pem')
    }
});
connection.connect();

app.get("/", async (req, res) => {
    console.log(">>>>Go index:");
    console.log(message);

    if (results.length < 1) {
        connection.query('select * from Products', function (error, rows) {
            if (error) throw error;

            for (let row of rows) {
                results.push({
                    title: row.title,
                    link: row.link
                });
            }

            return res.render('index', {});
        });
    }
    else {
        res.render('index', {});
    }
});

app.get("/scrap/:keyword", asyncHandler(async (req, res) => {
    console.log(">>>>Start scrap:");
    pageData = await scrap(req.params["keyword"]);
    results = getResults(pageData);

    console.log(">>>>Results:");
    for (let result of results) {
        console.log(JSON.stringify(result));
    }

    await loadProductsToDB();

    res.render('index', {});
}));

app.listen(port, async () => {
    console.log("Server has started");
});

app.engine('ntl', function (filePath, options, callback) {
    fs.readFile(filePath, function (err, content) {
        if (err) return callback(new Error(err));
        createTableResults();
        var rendered = content.toString().replace('#title#', '' + title + '').replace('#message#', '' + message + '').replace('#tableResults#', '' + tableResults + '').replace('#amascrapcontent-pageData#', '' + pageData + '');
        return callback(null, rendered);
    });
});
app.set('views', './views'); // specify the views directory
app.set('view engine', 'ntl'); // register the template engine

const scrap = async function (keyword) {
    let answer = 'none';

    const { data } = await axios.get('https://www.amazon.com/s?k=' + keyword);
    answer = data ? data : answer;

    console.log(">>>>Request data:");
    console.log(answer);

    return answer;
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
            + `\r\r<th>${parseInt(i) + 1}</th>\n`
            + `\r\r<th>${results[i].title}</th>\n`
            + `\r\r<th>${results[i].link}</th>\n`
            + '\r</tr>\n';
    }
    tableResults += '</table>';
    console.log('>>>>Table Results:\n' + tableResults);
}

const parseSingle = function (source, rgx) {
    try {
        return source.match(rgx)[1];
    } catch (e) {
        return '';
    }
}

const loadProductsToDB = async function () {
    for (let product of results) {
        connection.query(`insert into Products (title, link) values ('${product.title}', '${parseSingle(product.link, /(.+?)\?/)}')`, function (error, result) {
            if (error) throw error;
            console.log("1 record inserted, ID: " + result.insertId);
        });
    }
}
