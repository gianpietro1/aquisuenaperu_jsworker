const ws = require('ws');
const { randomUUID } = require('crypto');
require('dotenv').config();
const axios = require('axios');
const { gql } = require('@urql/core');
const {
  createClient,
  defaultExchanges,
  subscriptionExchange,
} = require('urql');
const { createClient: createWSClient } = require('graphql-ws');
const { pipe, subscribe } = require('wonka');

const SITE = process.env.SITE;

const tokenSYBJSON = `
mutation {
  loginUser(input: {email: "${process.env.SYB_EMAIL}", password: "${process.env.SYB_PASSWORD}"}) {
    token
    refreshToken
  }
}
`;

// curl -XPOST https://api.soundtrackyourbrand.com/v2 \
// -H 'Content-Type: application/graphql' \
// -d '

const tokenASPJSON = {
  email: process.env.ASP_EMAIL,
  password: process.env.ASP_PASSWORD,
};

const subscription = gql`
  subscription nowPlaying {
    nowPlayingUpdate(
      input: {
        soundZone: "${process.env.ZONE}"
      }
    ) {
      nowPlaying {
        track {
          title
          album {
            title
            releaseDate {
              timestamp
            }
            display {
              image {
                sizes {
                  thumbnail
                  hero
                  teaser
                }
              }
            }
          }
          artists {
            name
          }
        }
      }
    }
  }
`;

const npquery = `
query {
nowPlaying(soundZone: "${process.env.ZONE}") {
track {
  title
  album {
    title
    releaseDate {
      timestamp
    }
    display {
      image {
        sizes {
          thumbnail
          teaser
          hero
        }
      }
    }
  }
  artists {
    name
  }
}
}
}
`;

const putTrack = async (track, asp_token) => {
  const json = JSON.stringify({ currentTrack: track });
  await axios.put(
    `https://aquisuenaperu.com/api/site/${SITE}?updateType=nowPlaying`,
    // `http://localhost:3002/api/site/${SITE}?updateType=nowPlaying`,
    json,
    {
      headers: {
        accept: 'application/json',
        'Content-Type': 'application/json',
        'x-access-token': asp_token,
      },
    },
  );
};

const getSYBNP = async (asp_token, sybToken) => {
  const nowPlayingResponse = await axios.post(
    'https://api.soundtrackyourbrand.com/v2',
    npquery,
    {
      headers: {
        'Content-Type': 'application/graphql',
        Authorization: `${process.env.TOKEN_TYPE} ` + sybToken,
      },
    },
  );
  const firstTrack = nowPlayingResponse.data.data.nowPlaying.track;
  console.log('first track', firstTrack);
  if (firstTrack) {
    await putTrack(firstTrack, asp_token);
  }
};

const subscribeSYB = async (asp_token, sybToken, sybRefreshToken) => {
  const wsClient = createWSClient({
    url: 'wss://api.soundtrackyourbrand.com/v2/graphql-transport-ws',
    webSocketImpl: ws,
    generateID: () => randomUUID(),
  });

  const client = createClient({
    url: 'wss://api.soundtrackyourbrand.com/v2/graphql-transport-ws',
    connectionParams: {
      Authorization: `${process.env.TOKEN_TYPE} ` + sybToken,
    },
    webSocketImpl: ws,
    generateID: () => randomUUID(),
    exchanges: [
      ...defaultExchanges,
      subscriptionExchange({
        forwardSubscription: (operation) => ({
          subscribe: (sink) => ({
            unsubscribe: wsClient.subscribe(
              { query: operation.query, variables: operation.variables },
              sink,
            ),
          }),
        }),
      }),
    ],
  });

  const { unsubscribe } = pipe(
    client.subscription(subscription),
    subscribe((result) => {
      if (result.data.nowPlayingUpdate) {
        let track = result.data.nowPlayingUpdate.nowPlaying.track;
        console.log('subscription track', track);
        if (track) {
          putTrack(track, asp_token);
        }
        // TODO: refreshToken (WSS is not authenticated today)
      }
    }),
  );
};

const getNPandUpdate = async () => {
  const aspTokenReponse = await axios.post(
    'https://aquisuenaperu.com/api/login',
    tokenASPJSON,
    {},
  );
  const aspToken = aspTokenReponse.data.token;
  const sybTokenResponse = await axios.post(
    'https://api.soundtrackyourbrand.com/v2',
    tokenSYBJSON,
    {
      headers: {
        'Content-Type': 'application/graphql',
      },
    },
  );
  const sybToken = sybTokenResponse.data.data.loginUser.token;
  const sybRefreshToken = sybTokenResponse.data.data.loginUser.refreshToken;
  await getSYBNP(aspToken, sybToken);
  await subscribeSYB(aspToken, sybToken, sybRefreshToken);
};

getNPandUpdate();
