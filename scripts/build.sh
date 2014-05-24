#!/usr/bin/bash

rm -rf shippable
mkdir shippable
cd client
grunt testOnce
grunt dist
