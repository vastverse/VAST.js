#!/bin/bash

for i in {1..20}; do
  x=$((RANDOM % 1001))
  y=$((RANDOM % 1001))
  isGateway="false"
  if [ "$i" -eq 1 ]; then
    isGateway="true"
  fi
#  node start_matcher.js $i $x $y $isGateway 10.42.0.1 8000 $((8001 + i)) $((20000 + i)) 100 &
  node start_matcher.js $i $x $y $isGateway 10.42.0.1 8000 8001 20000 150 &
  sleep 1
done
