FROM postgres:16-alpine

RUN apk add --no-cache curl

COPY entrypoint.sh /usr/local/bin/educa-monitor
RUN chmod 755 /usr/local/bin/educa-monitor

ENTRYPOINT ["/usr/local/bin/educa-monitor"]
