#!/bin/bash

docker-compose run --rm server create_db
docker-compose up -d
