# Testing Network Access

To ensure the application is accessible from both internal and external networks, please follow these testing steps:

## Internal Network Access

1.  Connect a device (e.g., computer, smartphone) to the same local network as the server (e.g., the same Wi-Fi network).
2.  Open a web browser on this device.
3.  Navigate to `http://192.168.1.7:3000` (replace `192.168.1.7` with your server's actual internal IP if it's different).
4.  Verify that the application loads and all features, especially those making API calls (like login, loading data), work correctly.

## External Network Access

1.  You will need a device that is *not* connected to your local network. The easiest way to do this is often to use a smartphone with Wi-Fi turned OFF, using its mobile data connection instead.
2.  Open a web browser on this external device.
3.  Navigate to `http://79.116.193.109:3000` (replace `79.116.193.109` with your current public IP address if it has changed. You can find your public IP by searching "what is my IP" on Google from a device on your network).
4.  Verify that the application loads and all features work correctly. This confirms that port forwarding on your router is set up correctly for port 3000 and that the application can be accessed from the internet.

## Important Considerations

*   **Dynamic External IP:** Your external IP address (`79.116.193.109`) might be dynamic and could change over time if assigned by your Internet Service Provider (ISP). If you can no longer access the application externally, check if your public IP has changed. For a permanent solution, consider using a Dynamic DNS (DDNS) service.
*   **Router Configuration:** Ensure that port 3000 is correctly forwarded in your router settings to the internal IP address of the machine running the server (`192.168.1.7`).
*   **Firewall:** Make sure that no firewall (on your server machine or network) is blocking incoming connections on port 3000.
