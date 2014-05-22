### [Learnful](https://learnful.co/): Education for Digital Natives

Production: <a href="https://www.shippable.com/projects/537af423aae0ace700dc2b39"><img style="vertical-align: middle;" src="https://api.shippable.com/projects/537af423aae0ace700dc2b39/badge/master"/></a> &mdash; Chat: <a href="https://gitter.im/Learnful/learnful"><img style="vertical-align: middle;" src="https://badges.gitter.im/Learnful/learnful.png"/></a>

#### Setting up your development environment

1. Install [NodeJS](https://nodejs.org/).

2. `npm install -g grunt-cli bower http-server`

3. Create a new [Firebase](https://firebase.com/) datastore (suggested name: `learnful-dev-<username>`).

4. Set up environment variables in your `.bashrc`:

   ```bash
    export LEARNFUL_FIREBASE=learnful-dev-<username>
    export LEARNFUL_FIREBASE_AUTH=<secret>
   ```

   You can find the auth secret in your Firebase datastore's dashboard, appropriately enough in the
   "Secrets" section.

5. Clone the repository onto your machine.

6. Run the backend code:

   ```
    cd learnful/server
    npm install
    node main.js
   ```
   
   Leave it running in a separate shell.
   
7. Build and run the frontend code:

   ```
    cd learnful/client
    npm install
    bower install
    grunt
    http-server
   ```
   
   You only need to rebuild if you create or delete files in `learnful/client/src`, add or remove
   Bower components, or change the environment variables above.  Otherwise, just reload the page.

8. Build a client distribution:

   ```
    cd learnful/client
    grunt dist
    http-server dist
   ```

   Note that anything committed to `master` is immediately deployed to production.
