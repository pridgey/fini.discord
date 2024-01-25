#!/bin/bash
echo "Running Tortois"
source /home/pridgey/miniconda3/bin/activate tortoise
python /home/pridgey/Documents/tortoise-tts/tortoise/do_tts.py "$@"