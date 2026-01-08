// =======================================================
// 1. КОНФИГУРАЦИЯ FIREBASE: ЗАМЕНИТЕ ЭТИ ЗНАЧЕНИЯ СВОИМИ!
// =======================================================
const firebaseConfig = {
    apiKey: "YOUR_API_KEY", 
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
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

// ----------------------------------------
// 2. ЛОГИКА АУТЕНТИФИКАЦИИ И ЗАКРЕПЛЕНИЯ НИКА
// ----------------------------------------

/**
 * Генерирует уникальный цвет на основе имени пользователя.
 */
function generateColor(username) {
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
        hash = username.charCodeAt(i) + ((hash << 5) - hash);
    }
    let color = (hash & 0x00FFFFFF).toString(16).toUpperCase();
    return '#' + '00000'.substring(0, 6 - color.length) + color;
}

/**
 * Загружает сохраненный ник из Firestore и запускает интерфейс чата (chat.html).
 */
function loadNicknameAndEnterChat(user) {
    db.collection('users').doc(user.uid).get()
        .then(doc => {
            if (doc.exists && doc.data().username) {
                // Ник найден, перенаправляем на чат-страницу
                currentUID = user.uid;
                currentUsername = doc.data().username;
                currentUserColor = doc.data().color;
                
                // Переходим на страницу чата
                if (window.location.pathname.indexOf('chat.html') === -1) {
                    window.location.href = 'chat.html';
                }
                
                // Если мы уже на chat.html, запускаем чат
                if (document.getElementById('chat-app')) {
                    listenForMessages(currentRoom);
                    initChatSwitching();
                }
            } else {
                // Должны быть данные, если регистрация прошла успешно.
                alert('Ошибка: Данные пользователя не найдены. Войдите снова.');
                auth.signOut();
                window.location.href = 'login.html';
            }
        })
        .catch(error => {
            console.error("Ошибка загрузки данных пользователя:", error);
            auth.signOut();
            window.location.href = 'login.html';
        });
}

/**
 * Проверяет, занят ли ник в базе данных.
 * (Реализация требования: имя должно быть при регистрации занятым).
 */
async function checkNicknameAvailability(username) {
    // Делаем запрос в Firestore, ищем документ, где username равен введенному
    const usersRef = db.collection('users');
    const snapshot = await usersRef.where('username', '==', username).get();
    
    // Если размер snapshot > 0, значит, такой ник уже существует
    return snapshot.size > 0;
}

/**
 * Обрабатывает регистрацию нового пользователя и сохраняет ник.
 */
async function registerUser() {
    // Эта функция вызывается только на странице register.html
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
        
        // 3. Сохранение ника и цвета в отдельной коллекции 'users'
        await db.collection('users').doc(user.uid).set({
            username: username,
            color: userColor, 
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        alert('Регистрация успешна! Перенаправление на страницу входа.');
        window.location.href = 'login.html';

    } catch (error) {
        // Обработка ошибок Firebase (например, неверный формат email)
        alert('Ошибка регистрации: ' + error.message);
        console.error(error);
    }
}

/**
 * Обрабатывает вход существующего пользователя. Ник загружается автоматически.
 */
function loginUser() {
    // Эта функция вызывается только на странице login.html
    const email = document.getElementById('email-input').value;
    const password = document.getElementById('password-input').value;

    auth.signInWithEmailAndPassword(email, password)
        .then((userCredential) => {
            // Успешный вход. Загружаем сохраненный ник и перенаправляем на chat.html.
            loadNicknameAndEnterChat(userCredential.user);
        })
        .catch((error) => {
            alert('Ошибка входа: ' + error.message);
            console.error(error);
        });
}

/**
 * Выход из системы.
 */
function logoutUser() {
    auth.signOut()
        .then(() => {
            alert('Вы успешно вышли из системы.');
            window.location.href = 'login.html';
        })
        .catch((error) => {
            console.error("Ошибка выхода:", error);
        });
}


// ----------------------------------------
// 3. ЛОГИКА ЧАТА (без изменений)
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

function displayMessage(data) {
    const container = document.getElementById('messages-container');
    const messageElement = document.createElement('div');
    messageElement.classList.add('message');

    const date = data.timestamp && data.timestamp.toDate ? data.timestamp.toDate() : new Date();
    const timeString = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

    messageElement.innerHTML = `
        <span class="username" style="color: ${data.color};">${data.username}</span>
        <span class="text">${data.text}</span>
        <span class="time">${timeString}</span>
    `;
    
    container.appendChild(messageElement);
    container.scrollTop = container.scrollHeight;
}

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
                if (change.type === "added") {
                    displayMessage(change.doc.data());
                }
            });
        }, (error) => {
            console.error("Ошибка прослушивания чата: ", error);
        });
}

// ----------------------------------------
// 4. ЛОГИКА МЕНЮ
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

// Привязываем функции к глобальному объекту window
window.registerUser = registerUser;
window.loginUser = loginUser;
window.sendMessage = sendMessage;
window.logoutUser = logoutUser;
