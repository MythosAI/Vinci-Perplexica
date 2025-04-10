### Adding auth0
* use `yard add` for new packages and the packages will be updated automatically
* auth-secret generate with `openssl rand -hex 32`
* need to no-cache if updating packages...don't need to remove `--frozen-lockfile` can be handled with `yarn`
* version 2 is using 

### Adding userID to the schema
* complaining about userID column not existing find a way to reset the database within the docker container


### Chats and Messages Schema

CREATE TABLE chats (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  title TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  focusMode TEXT NOT NULL,
  files JSON DEFAULT '[]'
);

CREATE TABLE messages (
  id SERIAL PRIMARY KEY,
  content TEXT NOT NULL,
  chatId TEXT NOT NULL,
  messageId TEXT NOT NULL,
  role TEXT CHECK (role IN ('assistant', 'user')),
  metadata JSON
);

### Errors
1. admin page can't see all messages
2. having weird fetch issue with .env