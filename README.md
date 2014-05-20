### [Learnful](https://learnful.co/): Education for Digital Natives

#### Setting up your development environment

1. Install [NodeJS](https://nodejs.org/).
2. `npm install -g grunt-cli bower http-server`
3. Create a new [Firebase](https://firebase.com/) datastore (suggested name: learnful-dev-<username>).
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
    node graph_updater.js
   ```
   
7. Build and run the frontend code:

   ```
    cd learnful/client
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
