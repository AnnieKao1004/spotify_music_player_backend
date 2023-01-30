require('dotenv').config();

const fs = require('fs');
const path = require('path');
const qs = require('qs');
const fetch = require('node-fetch');

const randomStr = require('./utils/random');
const port = 8000;
const express = require('express');
const cors = require('cors');
const app = express();
app.use(cors());

// middleware
const morgan = require('morgan'); //logger
const cookieParser = require('cookie-parser');

const accessLogStream = fs.createWriteStream(path.join(__dirname, 'access.log'), {
  flags: 'a', // Open file for appending. The file is created if it does not exist.
});
app.use(morgan('combined', { stream: accessLogStream }));
app.use(cookieParser());

app.use(express.static(path.join(__dirname, 'client/build')));

// Spotify info
const scope = 'user-top-read';
const client_id = process.env.CLIENT_ID;
const client_secret = process.env.CLIENT_SECRET;
const redirect_uri =
  process.env.NODE_ENV !== 'production' ? process.env.RE_URI : process.env.RE_URI_PROD;
const frontend_uri =
  process.env.NODE_ENV !== 'production'
    ? process.env.FRONT_END_URI
    : process.env.FRONT_END_URI_PROD;

// Router
// login
app.get('/login', function (req, res) {
  const state = randomStr(16);
  res.cookie('state', state);

  res.redirect(
    `https://accounts.spotify.com/authorize?${qs.stringify({
      response_type: 'code',
      client_id: client_id,
      scope: scope,
      redirect_uri: redirect_uri,
      state: state,
      show_dialog: true,
    })}`,
  );
});

// login callback
app.get('/callback', async function (req, res) {
  const code = req.query.code || null;
  const state = req.query.state || null;
  const storedState = req.cookies.state || null;

  if (state === null || state !== storedState) {
    res.redirect(`/#${qs.stringify({ error: 'state_mismatch' })}`);
  } else {
    res.clearCookie('state');

    const params = new URLSearchParams();
    params.append('grant_type', 'authorization_code');
    params.append('code', code);
    params.append('redirect_uri', redirect_uri);

    // get access token
    const options = {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${client_id}:${client_secret}`, 'utf-8').toString(
          'base64',
        )}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    };
    try {
      const response = await fetch('https://accounts.spotify.com/api/token', options);

      const data = await response.json();
      console.log(data);
      const { access_token, refresh_token } = data;

      res.cookie('refresh_token', refresh_token, {
        httpOnly: true,
        secure: true,
      });

      res.redirect(
        `${frontend_uri}#` +
          qs.stringify({
            access_token: access_token,
          }),
      );
    } catch (error) {
      console.log(error);
    }
  }
});

// refresh token
app.get('/refresh_token', async function (req, res) {
  console.log('refresh_token');
  const refresh_token = req.cookies['refresh_token'];
  console.log(refresh_token);
  if (refresh_token) {
    const params = new URLSearchParams();
    params.append('grant_type', 'refresh_token');
    params.append('refresh_token', refresh_token);

    const options = {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${client_id}:${client_secret}`, 'utf-8').toString(
          'base64',
        )}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params,
    };

    try {
      const response = await fetch('https://accounts.spotify.com/api/token', options);
      const data = await response.json();
      const { access_token } = data;
      res.send({ token: access_token });
    } catch (error) {}
  } else {
    res.status(400).send({ error: 'no refresh token is found' });
  }
});

app.listen(process.env.PORT || port, () => {
  console.log(`app listening at http://localhost:${port}`);
});
