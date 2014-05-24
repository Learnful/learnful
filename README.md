### [Learnful](https://learnful.co/): Education for Digital Natives

##### Deployment: [![Build Status](https://api.shippable.com/projects/537af423aae0ace700dc2b39/badge/master)](https://www.shippable.com/projects/537af423aae0ace700dc2b39) &mdash; Chat: [![Gitter chat](https://badges.gitter.im/Learnful/learnful.png)](https://gitter.im/Learnful/learnful) &mdash; Tasks: [Huboard](https://huboard.com/Learnful/learnful/)

* [Production site](https://learnful.co/)
* [What's the idea behind this?](https://docs.google.com/a/learnful.co/document/d/1m7L0xPFck2LlyMUtoxK2yEF3Hd3K-7KleBRqh4GktQY/edit)
* [Release notes](https://docs.google.com/a/learnful.co/document/d/1eyVw3oVN1RBCNmmHryj8qtQHN64JTvAq7rCzprmNr5A/edit)
* [Discussion group](https://groups.google.com/a/learnful.co/forum/#!forum/pioneers)
* [Contributor Licensing Agreement](https://docs.google.com/forms/d/14yvwr6CXporVvPbBPoN4Wo5MJU2CnQDCACjF4ERBdU0/viewform?usp=send_form)

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

   Note that anything committed to `master` is immediately deployed to production, and that you'll
   need to [sign a Contributor Licensing Agreement](https://docs.google.com/forms/d/14yvwr6CXporVvPbBPoN4Wo5MJU2CnQDCACjF4ERBdU0/viewform?usp=send_form)
   before we can accept your pull request.
