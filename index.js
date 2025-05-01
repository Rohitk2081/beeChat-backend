const socket = io("http://localhost:3000"); // Update if needed
let username = prompt("Enter your name (Buzz or Bee):");

function sendMessage() {
  const input = document.getElementById("messageInput");
  const message = input.value.trim();
  if (message !== "") {
    const data = { user: username, msg: message };
    socket.emit("chat message", data);
    appendMessage(data, "sent");
    input.value = "";
  }
}

function appendMessage(data, type) {
  const msgDiv = document.createElement("div");
  msgDiv.className = `message ${type}`;
  msgDiv.innerHTML = `<strong>${data.user}:</strong> ${data.msg}`;
  document.getElementById("messages").appendChild(msgDiv);
  msgDiv.scrollIntoView({ behavior: "smooth" });
}

socket.on("chat message", (data) => {
  appendMessage(data, "received");

  if (document.hidden && Notification.permission === "granted") {
    new Notification(`${data.user} says:`, { body: data.msg });
  }
});

if (Notification.permission !== "granted") {
  Notification.requestPermission();
}
