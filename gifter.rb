# frozen_string_literal: true

require 'yaml'
require 'net/smtp'
require 'erubis'

file_name = 'demonthelie.yaml'

gifters = YAML.load_file(file_name)['list']
admin = YAML.load_file(file_name)['admin']
mailconfig = YAML.load_file(file_name)['mailconfig']

loop do
  gifter = gifters.sample { |g| g['target'].nil? }
  lukies = gifters.map { |g| g['target'] }
  lukies.push(gifter['lover'])
  lukies.push(gifter['name'])
  targets = gifters.reject { |g| lukies.include?(g['name']) }
  if targets.empty?
    print 'RESET '
    gifters.map { |g| g['target'] = nil }
    next
  end
  gifter['target'] = targets.sample['name']
  break if gifters.none? { |g| g['target'].nil? }
end

print gifters.to_yaml

gifters.each do |gifter|
  input = File.read('email.eruby')
  eruby = Erubis::Eruby.new(input)
  context = { admin_name: admin['name'],
              admin_email: admin['mail'],
              to_name: gifter['name'],
              to_email: gifter['mail'],
              subject: mailconfig['subject'],
              friend: gifter['target'] }

  message = eruby.evaluate(context)
  puts message
  Net::SMTP.start('smtp.free.fr', 25) do |smtp|
    smtp.send_message message, 'xav.bourdeau@free.fr', gifter['mail']
  end
end
