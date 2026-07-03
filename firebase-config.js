// 🔥 Firebase 콘솔 > 프로젝트 설정 > 내 앱 에서 복사한 값을
// 아래 firebaseConfig 안에 그대로 붙여넣으세요. (가이드 문서의 3단계 참고)

const firebaseConfig = {
  apiKey: "AIzaSyCEAmm608yH7apzg69FLbSeqpQU383tnLA",
  authDomain: "geeo0-7cdd3.firebaseapp.com",
  projectId: "geeo0-7cdd3",
  storageBucket: "geeo0-7cdd3.firebasestorage.app",
  messagingSenderId: "799619240336",
  appId: "1:799619240336:web:c4887f095c403c9b27e315"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
