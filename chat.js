// =======================================================
// 1. КОНФИГУРАЦИЯ FIREBASE: ЗАМЕНИТЕ ЭТИ ЗНАЧЕНИЯ СВОИМИ!
// =======================================================
const firebaseConfig = {
  apiKey: "AIzaSyD6QPH3kc6dtA6W1po2HQ4Z30V2PS6tNIc",
  authDomain: "my-chat-5d859.firebaseapp.com",
  projectId: "my-chat-5d859",
  storageBucket: "my-chat-5d859.firebasestorage.app",
  messagingSenderId: "11785440548",
  appId: "1:11785440548:web:51a6df3586bb0af641b7b1"
};

// Инициализация Firebase, Firestore и Auth
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const auth = firebase.auth();

// Глобальные переменные состояния
let currentUsername = '';
let currentUserColor = '';
let currentRoom = 'RU Main';
let currentUID = '';
let unsubscribe = null;
let currentEmail = ''; // НОВОЕ: Email текущего пользователя
let isAdmin = false; // НОВОЕ: Флаг администратора
const ADMIN_EMAIL = 'm@roxera.xyz'; // НОВОЕ: Почта администратора

// ----------------------------------------
// 2. ЛОГИКА АУТЕНТИФИКАЦИИ И ЗАКРЕПЛЕНИЯ НИКА
// ----------------------------------------

function generateColor(username) {
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
        hash = username.charCodeAt(i) + ((hash << 5) - hash);
    }
    let color = (hash & 0x00FFFFFF).toString(16).toUpperCase();
    return '#' + '00000'.substring(0, 6 - color.length) + color;
}

/**
 * Загружает сохраненный ник из Firestore и запускает интерфейс чата.
 * Используется для автологина (сохранения сессии).
 */
function loadNicknameAndEnterChat(user) {
    db.collection('users').doc(user.uid).get()
        .then(doc => {
            if (doc.exists && doc.data().username) {
                // Если мы на странице входа/регистрации, перенаправляем на чат
                if (window.location.pathname.indexOf('chat.html') === -1) {
                    window.location.href = 'chat.html';
                    return;
                }
                
                // Если мы уже на chat.html, инициализируем данные
                currentUID = user.uid;
                currentUsername = doc.data().username;
                currentUserColor = doc.data().color;
                
                // НОВОЕ: Проверка прав администратора
                currentEmail = user.email || ''; 
                isAdmin = currentEmail === ADMIN_EMAIL;
                console.log(`Пользователь: ${currentUsername}, Администратор: ${isAdmin}`);
                
                // Запускаем чат
                if (document.getElementById('chat-app')) {
                    listenForMessages(currentRoom);
                    initChatSwitching();
                }
            } else {
                // Это может произойти, если пользователь удалил ник из базы вручную.
                // Перенаправляем на логин.
                auth.signOut();
                if (window.location.pathname.indexOf('login.html') === -1) {
                    window.location.href = 'login.html';
                }
            }
        })
        .catch(error => {
            console.error("Ошибка загрузки данных пользователя:", error);
            auth.signOut();
            if (window.location.pathname.indexOf('login.html') === -1) {
                window.location.href = 'login.html';
            }
        });
}

/**
 * Проверяет, занят ли ник в базе данных.
 */
async function checkNicknameAvailability(username) {
    const usersRef = db.collection('users');
    const snapshot = await usersRef.where('username', '==', username).get();
    return snapshot.size > 0;
}

/**
 * Обрабатывает регистрацию нового пользователя, проверяет уникальность ника.
 */
async function registerUser() {
    const email = document.getElementById('email-input').value;
    const password = document.getElementById('password-input').value;
    const username = document.getElementById('username-input').value.trim();

    if (!username || username.length < 3) {
        alert('Пожалуйста, введите имя (ник) от 3 символов.');
        return;
    }
    if (password.length < 6) {
        alert('Пароль должен быть не менее 6 символов.');
        return;
    }

    try {
        // 1. ПРОВЕРКА УНИКАЛЬНОСТИ НИКА
        const isTaken = await checkNicknameAvailability(username);
        if (isTaken) {
            alert('Ошибка: Ник "' + username + '" уже занят. Выберите другой.');
            return;
        }

        // 2. Создание аккаунта Email/Password
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;
        const userColor = generateColor(username);
        
        // 3. Сохранение ника, цвета И EMAIL (НОВОЕ) в отдельной коллекции 'users'
        await db.collection('users').doc(user.uid).set({
            username: username,
            color: userColor, 
            email: email, // НОВОЕ: Сохраняем email для отображения администратору
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        alert('Регистрация успешна! Перенаправление на страницу входа.');
        
        auth.signOut();
        window.location.href = 'login.html';

    } catch (error) {
        alert('Ошибка регистрации: ' + error.message);
        console.error(error);
    }
}

/**
 * Обрабатывает вход существующего пользователя.
 */
function loginUser() {
    const email = document.getElementById('email-input').value;
    const password = document.getElementById('password-input').value;

    auth.signInWithEmailAndPassword(email, password)
        .then((userCredential) => {
            // Успешный вход. loadNicknameAndEnterChat позаботится о перенаправлении.
            loadNicknameAndEnterChat(userCredential.user);
        })
        .catch((error) => {
            alert('Ошибка входа: ' + error.message);
            console.error(error);
        });
}

/**
 * Выход из системы (удаление токена сессии).
 */
function logoutUser() {
    auth.signOut()
        .then(() => {
            // Успешно вышли, перенаправляем на страницу входа
            window.location.href = 'login.html';
        })
        .catch((error) => {
            console.error("Ошибка выхода:", error);
        });
}


// ----------------------------------------
// 3. НОВОЕ: ЛОГИКА УДАЛЕНИЯ СООБЩЕНИЙ (АДМИН)
// ----------------------------------------

/**
 * Удаляет сообщение из Firestore.
 * @param {string} messageId - ID документа сообщения.
 */
function deleteMessage(messageId) {
    if (!isAdmin) {
        alert("У вас нет прав для удаления сообщений.");
        return;
    }

    if (confirm("Вы уверены, что хотите удалить это сообщение?")) {
        // УДАЛЕНИЕ В БАЗЕ ДАННЫХ
        db.collection(currentRoom).doc(messageId).delete()
            .then(() => {
                console.log("Сообщение успешно удалено!");
            })
            .catch((error) => {
                console.error("Ошибка при удалении сообщения: ", error);
                alert("Не удалось удалить сообщение. Проверьте правила безопасности Firestore!");
            });
    }
}


// ----------------------------------------
// 4. ЛОГИКА ЧАТА (ОБНОВЛЕННАЯ)
// ----------------------------------------

function sendMessage() {
    const input = document.getElementById('message-input');
    const messageText = input.value.trim();

    if (!messageText || !currentUsername || !currentUID) return; 

    db.collection(currentRoom).add({
        username: currentUsername,
        text: messageText,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(), 
        color: currentUserColor,
        uid: currentUID 
    })
    .then(() => {
        input.value = '';
    })
    .catch((error) => {
        console.error("Ошибка при отправке: ", error);
        alert("Не удалось отправить сообщение. Проверьте правила Firestore!");
    });
}

/**
 * Отображает сообщение в контейнере.
 * @param {object} data - Данные сообщения.
 * @param {string} messageId - ID документа сообщения (НОВОЕ).
 */
function displayMessage(data, messageId) {
    const container = document.getElementById('messages-container');
    const messageElement = document.createElement('div');
    messageElement.classList.add('message');
    messageElement.id = `msg-${messageId}`; // Устанавливаем ID для возможного удаления из DOM

    const date = data.timestamp && data.timestamp.toDate ? data.timestamp.toDate() : new Date();
    const timeString = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

    // НОВОЕ: HTML-код для кнопки "Удалить" (только для админа)
    let adminControlsHTML = '';
    if (isAdmin) {
        adminControlsHTML = `<button class="delete-btn" onclick="deleteMessage('${messageId}')">✖</button>`;
        
        // НОВОЕ: Асинхронная загрузка email для подсказки (hover)
        if (data.uid) {
             db.collection('users').doc(data.uid).get().then(doc => {
                 if (doc.exists && doc.data().email) {
                      // Ищем элемент .username внутри сообщения и добавляем атрибут title
                      const usernameSpan = messageElement.querySelector('.username');
                      if (usernameSpan) {
                          usernameSpan.setAttribute('title', `Email: ${doc.data().email}`);
                      }
                 }
             }).catch(console.error);
        }
    }

    messageElement.innerHTML = `
        <span class="username" style="color: ${data.color};">${data.username}</span>
        <span class="text">${data.text}</span>
        ${adminControlsHTML} 
        <span class="time">${timeString}</span>
    `;
    
    container.appendChild(messageElement);
    container.scrollTop = container.scrollHeight;
}

/**
 * Прослушивание сообщений (обновлено для передачи messageId и обработки удаления).
 */
function listenForMessages(room) {
    if (unsubscribe) {
        unsubscribe();
    }

    const messagesContainer = document.getElementById('messages-container');
    messagesContainer.innerHTML = ''; 

    unsubscribe = db.collection(room)
        .orderBy('timestamp', 'asc')
        .onSnapshot((snapshot) => {
            snapshot.docChanges().forEach(change => {
                const messageData = change.doc.data();
                const messageId = change.doc.id; 
                
                if (change.type === "added") {
                    displayMessage(messageData, messageId); // Передаем ID
                } else if (change.type === "removed") {
                    // Обработка удаления сообщения из DOM
                    const elementToRemove = document.getElementById(`msg-${messageId}`);
                    if (elementToRemove) {
                        elementToRemove.remove();
                    }
                }
            });
        }, (error) => {
            console.error("Ошибка прослушивания чата: ", error);
        });
}

// ----------------------------------------
// 5. ЛОГИКА МЕНЮ
// ----------------------------------------

function initChatSwitching() {
    const chatList = document.getElementById('chat-list');
    chatList.addEventListener('click', (event) => {
        const li = event.target.closest('li');
        if (li && li.dataset.room) {
            switchRoom(li.dataset.room);
        }
    });
}

function switchRoom(newRoom) {
    if (newRoom === currentRoom) return;

    const activeLi = document.querySelector('#chat-list li.active');
    if (activeLi) {
        activeLi.classList.remove('active');
    }
    const newLi = document.querySelector(`#chat-list li[data-room="${newRoom}"]`);
    if (newLi) {
        newLi.classList.add('active');
    }

    currentRoom = newRoom;
    document.getElementById('current-room-name').textContent = newRoom;
    
    listenForMessages(currentRoom);
}

// Привязываем функции к глобальному объекту window (для вызова из HTML)
window.registerUser = registerUser;
window.loginUser = loginUser;
window.sendMessage = sendMessage;
window.logoutUser = logoutUser;
window.loadNicknameAndEnterChat = loadNicknameAndEnterChat; 
window.deleteMessage = deleteMessage; // НОВОЕ: Для кнопки удаления
