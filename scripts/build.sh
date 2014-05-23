#!/usr/bin/bash

rm -rf shippable
cd client
grunt testOnce
grunt dist
