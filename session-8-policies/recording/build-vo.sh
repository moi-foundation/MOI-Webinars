#!/bin/zsh
# Assemble the slide narrations into one track, with a gap between slides and
# a timing sheet for syncing to the deck.
#
#   ./build-vo.sh
#
# Slide 8 is commentary over demo.mp4, so it gets no trailing gap — the video
# carries that section on its own.
cd "$(dirname "$0")"
GAP=1.2
rm -f vo/gap.wav narration.m4a timings.txt
ffmpeg -v error -f lavfi -i anullsrc=r=24000:cl=mono -t $GAP -c:a pcm_s16le vo/gap.wav -y

: > /tmp/vo-list.txt
: > timings.txt
t=0
for i in $(seq -w 1 13); do
  f="vo/slide-$i.wav"
  [ -s "$f" ] || { echo "missing $f"; exit 1; }
  d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f")
  printf "slide %s  starts %02d:%05.2f  runs %5.1fs\n" "$i" $((${t%.*}/60)) $(python3 -c "print($t%60)") "$d" >> timings.txt
  echo "file '$PWD/$f'" >> /tmp/vo-list.txt
  t=$(python3 -c "print(round($t+$d+$GAP,2))")
  [ "$i" != "13" ] && echo "file '$PWD/vo/gap.wav'" >> /tmp/vo-list.txt
done

ffmpeg -v error -f concat -safe 0 -i /tmp/vo-list.txt -c:a aac -b:a 160k narration.m4a -y
printf "\ntotal %s\n" "$(ffprobe -v error -show_entries format=duration -of csv=p=0 narration.m4a | awk '{printf "%d:%02d", $1/60, $1%60}')" >> timings.txt
cat timings.txt
