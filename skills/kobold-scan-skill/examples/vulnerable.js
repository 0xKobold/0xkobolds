const express = require('express');
const fs = require('fs');

// Hardcoded API credentials
const API_KEY = 'sk-1234567890abcdef';
const databasePassword = 'admin12345';

// Debug logging
console.log('Server starting with key:', API_KEY);

const app = express();

// Vulnerable SQL query construction
app.get('/users', (req, res) => {
    const query = "SELECT * FROM users WHERE id = '" + req.query.id + "'";
    db.query(query, (err, results) => {
        res.json(results);
    });
});

// Eval usage - dangerous
app.post('/calc', (req, res) => {
    const expression = req.body.expression;
    const result = eval(expression);
    res.json({ result });
});

// Path traversal vulnerability
app.get('/file', (req, res) => {
    const filename = req.query.filename;
    const filePath = './data/' + filename;
    fs.readFile(filePath, (err, data) => {
        res.send(data);
    });
});

// Prototype pollution
function merge(target, source) {
    for (let key in source) {
        target[key] = source[key];
    }
}

app.post('/import', (req, res) => {
    const user = { name: 'default' };
    Object.prototype.admin = true;
    merge(user, req.body);
    res.json(user);
});

app.listen(3000, () => {
    console.log('Server running on port 3000'); // TODO: Move to config
});

// TODO: Add authentication
// FIXME: Security review needed
