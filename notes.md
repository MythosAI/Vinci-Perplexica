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
2. getting weird CORS stuff? why is it having this problem?
```
Access to fetch at 'https://dev-ro6evo3e0wuurdi1.us.auth0.com/oidc/logout?client_id=coIQgdX82ogZwI2ZyPj27Vli8iUrvGIW&post_logout_redirect_uri=https%3A%2F%2Fapp.vincilabs.ai&logout_hint=1em2IMhLCIwpYJbuV_9MDt7ZYHBw1Ucx' (redirected from 'https://app.vincilabs.ai/auth/logout?_rsc=1j6cs') from origin 'https://app.vincilabs.ai' has been blocked by CORS policy: Response to preflight request doesn't pass access control check: No 'Access-Control-Allow-Origin' header is present on the requested resource. If an opaque response serves your needs, set the request's mode to 'no-cors' to fetch the resource with CORS disabled.
```

```
684-58c1499229fbf981.js:1 
            
            
           GET https://dev-ro6evo3e0wuurdi1.us.auth0.com/oidc/logout?client_id=coIQgdX82ogZwI2ZyPj27Vli8iUrvGIW&post_logout_redirect_uri=https%3A%2F%2Fapp.vincilabs.ai&logout_hint=1em2IMhLCIwpYJbuV_9MDt7ZYHBw1Ucx net::ERR_FAILED
```

```
684-58c1499229fbf981.js:1 Failed to fetch RSC payload for https://app.vincilabs.ai/auth/logout. Falling back to browser navigation. TypeError: Failed to fetch
    at y (684-58c1499229fbf981.js:1:125603)
    at h (684-58c1499229fbf981.js:1:124530)
    at 684-58c1499229fbf981.js:1:19629
    at Object.u [as task] (684-58c1499229fbf981.js:1:28400)
    at c.s (684-58c1499229fbf981.js:1:29105)
    at c.enqueue (684-58c1499229fbf981.js:1:28530)
    at s (684-58c1499229fbf981.js:1:19592)
    at i (684-58c1499229fbf981.js:1:19117)
    at l (684-58c1499229fbf981.js:1:161256)
    at Object.prefetch (684-58c1499229fbf981.js:1:86854)
    at 684-58c1499229fbf981.js:1:64967
    at 684-58c1499229fbf981.js:1:65006
    at p (684-58c1499229fbf981.js:1:65022)
    at f (684-58c1499229fbf981.js:1:64747)
    at IntersectionObserver.rootMargin (684-58c1499229fbf981.js:1:64073)
```