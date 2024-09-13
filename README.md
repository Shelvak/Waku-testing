# Install
`yarn install`

# Run
   In diff terminals/windows
```bash
DEBUG=waku:info:sdk* npx tsx receiver.ts # <= Wait until "Listening for messages..." output
DEBUG=waku:info:sdk* npx tsx sender.ts # <= Send one msg and exit
```
