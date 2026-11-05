# Mystery Friends

A secret-gift-exchange web app (Node/Express API + MySQL + vanilla JS front).

1. Someone creates a group and gets three unique links: **admin**, **invitation**, and their own **personal** link.
2. They share the invitation link; each guest joins with just a name and gets a personal link.
3. In the admin page, pairs who must not give to each other (couples, feuds…) can be forbidden.
4. Once everyone has joined, the admin clicks **Roll the dice**. Each guest opens their personal link to see who they give a gift to. The admin can reveal the full results from the admin page.

There are no accounts: links are random 128-bit tokens, and users are reminded to save them. Lost links can't be recovered.

## Run

```sh
docker compose up --build   # http://localhost:3000
```

Without Docker: `npm install`, start a MySQL 8 database, then `npm start`.
Settings (env vars): `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `PORT`.

## Tests

```sh
npm test
```

## Origin

This tradition is common in big families: instead of everybody buying a gift for everybody, each person draws one name and offers one nice gift.
