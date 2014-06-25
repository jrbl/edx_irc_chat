#sudo python irc_log_parse.py activity.log.0 OpenEdX.200.Stanford_Sandbox
import re, sys
from pytz import timezone
from datetime import datetime

pacific = timezone('US/Pacific')

#sys.argv = command line arguments
log_file = sys.argv[1]
channel = sys.argv[2]
#log_file = "./activity.log.0"
#channel = "OpenEdX.200.Stanford_Sandbox"

regexp = re.compile(r"^(?P<date>\d{10}) PRIVMSG (?P<nick>.+?) #"+channel+" (?P<message>.*)$")
output = '<div id="ircui" class="qwebirc qwebirc-qui"><div class="lines ircwindow qwebirc-qui">'

def render_html(date, nick, message):
  tmzn_time = datetime.fromtimestamp(int(date), pacific).strftime("%H:%M")
  rendered_date = '<span class="timestamp">['+tmzn_time+']</span>'

  rendered_nick = '<span class="hyperlink-whois">'+nick+'</span>'

  return '<div class="msg-line">'+rendered_date+'<span class="message">'+rendered_nick+' '+message+'</span></div>'


with open(log_file) as f:
  for line in f:
    m = regexp.match(line)
    if m:
      output += render_html(m.group('date'), m.group('nick'), m.group('message'))

output += '</div></div>'
print output