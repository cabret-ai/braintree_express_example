const express = require('express');
const { join } = require('path');
const favicon = require('serve-favicon');
const logger = require('morgan-debug');
const { json, urlencoded, raw } = require('body-parser');
const session = require('express-session');
const flash = require('connect-flash');
const router = require('./routes');
const createError = require('http-errors');

const app = express();
const staticRoot = join(__dirname, 'public');

app.set('views', join(__dirname, 'views'));
app.set('view engine', 'pug');

app.use(favicon(join(staticRoot, 'images', 'favicon.png')));
app.use(logger('stripe_example:app', 'dev'));

app.use('/stripe/webhooks', raw({ type: 'application/json' }));

app.use(json());
app.use(urlencoded({ extended: false }));
app.use(
  session({
    secret: '---',
    saveUninitialized: true,
    resave: true,
  })
);
app.use(express.static(staticRoot));
app.use(flash());

app.use('/', router);

app.use((req, res, next) => {
  next(createError(404));
});

if (app.get('env') === 'development') {
  app.use((err, req, res, _next) => {
    res.status(err.status || 500);
    res.render('error', {
      message: err.message,
      error: err,
    });
  });
}

app.use((err, req, res, _next) => {
  res.status(err.status || 500);
  res.render('error', {
    message: err.message,
    error: {},
  });
});

module.exports = app;
