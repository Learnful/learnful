#!/usr/bin/bash

mv shippable/codecoverage/PhantomJS*/* shippable/codecoverage
rm -rf shippable/codecoverage/PhantomJS*
cat shippable/testresults/results.xml
