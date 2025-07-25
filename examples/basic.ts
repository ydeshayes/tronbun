import { Window } from "../src";

const window = new Window();
const window2 = new Window();

window.registerIPCHandler('test', (data) => {
    console.log('test', data);
    return 'test';
});

window.setTitle('Test');

window.navigate('https://www.google.com');

window2.setHtml('<h1>Test 2</h1>');

setTimeout(() => {
    window.executeScript('console.log("test")');
    window2.setTitle('Change title');
}, 5000);
