import { ensureDefaultAdmin, loginUser, redirectToDashboard, registerUser, resetUserPassword } from './App.js';

const loginForm = document.getElementById('loginForm');
if (loginForm) {
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const passwordToggle = document.getElementById('togglePassword');
    const errorMessage = document.getElementById('errorMessage');
    try {
        ensureDefaultAdmin();
    } catch (error) {
        console.error('Default administrator could not be initialized.', error);
        showFormError(errorMessage, 'Default administrator could not be initialized. Check browser storage and try again.');
    }
    clearFieldErrorsWhenEdited(loginForm, errorMessage);

    if (passwordToggle) {
        passwordToggle.addEventListener('change', function () {
            passwordInput.type = passwordToggle.checked ? 'text' : 'password';
        });
    }

    loginForm.addEventListener('submit', async function (event) {
        event.preventDefault();
        clearAllFieldErrors(loginForm);
        clearFormError(errorMessage);

        const errors = [];
        addEmailError(errors, emailInput);
        if (!passwordInput.value) {
            errors.push({ input: passwordInput, message: 'Enter your password.' });
        }
        if (showValidationErrors(errors)) {
            return;
        }

        try {
            const result = await loginUser(emailInput.value, passwordInput.value);
            if (result.success) {
                redirectToDashboard(result.role);
                return;
            }
            showFormError(errorMessage, result.message);
        } catch (error) {
            console.error('Sign-in could not be completed.', error);
            showFormError(errorMessage, 'Sign-in could not be completed. Check browser storage and try again.');
        }
    });
}

const registerForm = document.getElementById('registerForm');
if (registerForm) {
    const nameInput = document.getElementById('fullName');
    const emailInput = document.getElementById('email');
    const roleInput = document.getElementById('role');
    const passwordInput = document.getElementById('password');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    const errorMessage = document.getElementById('regError');
    clearFieldErrorsWhenEdited(registerForm, errorMessage);

    registerForm.addEventListener('submit', async function (event) {
        event.preventDefault();
        clearAllFieldErrors(registerForm);
        clearFormError(errorMessage);

        const errors = [];
        if (!nameInput.value.trim()) {
            errors.push({ input: nameInput, message: 'Enter your full name.' });
        }
        addEmailError(errors, emailInput);
        if (!roleInput.value) {
            errors.push({ input: roleInput, message: 'Choose an account role.' });
        }
        addPasswordErrors(errors, passwordInput, confirmPasswordInput);

        if (showValidationErrors(errors)) {
            return;
        }

        try {
            const result = await registerUser(
                nameInput.value,
                emailInput.value,
                roleInput.value,
                passwordInput.value,
                false
            );
            if (result.success) {
                window.location.href = 'login.html';
                return;
            }
            showFormError(errorMessage, result.message);
        } catch (error) {
            console.error('Account registration could not be completed.', error);
            showFormError(errorMessage, 'Account registration could not be completed. Check browser storage and try again.');
        }
    });
}

const resetForm = document.getElementById('resetForm');
if (resetForm) {
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('newPassword');
    const confirmPasswordInput = document.getElementById('confirmNewPassword');
    const errorMessage = document.getElementById('resetError');
    clearFieldErrorsWhenEdited(resetForm, errorMessage);

    resetForm.addEventListener('submit', async function (event) {
        event.preventDefault();
        clearAllFieldErrors(resetForm);
        clearFormError(errorMessage);

        const errors = [];
        addEmailError(errors, emailInput);
        addPasswordErrors(errors, passwordInput, confirmPasswordInput);
        if (showValidationErrors(errors)) {
            return;
        }

        try {
            const result = await resetUserPassword(emailInput.value, passwordInput.value);
            if (result.success) {
                window.location.href = 'login.html';
                return;
            }
            showFormError(errorMessage, result.message);
        } catch (error) {
            console.error('Password reset could not be completed.', error);
            showFormError(errorMessage, 'Password reset could not be completed. Check browser storage and try again.');
        }
    });
}

function addEmailError(errors, input) {
    if (!input.value.trim()) {
        errors.push({ input: input, message: 'Enter your email address.' });
    } else if (!input.validity.valid) {
        errors.push({ input: input, message: 'Enter a valid email address.' });
    }
}

function addPasswordErrors(errors, passwordInput, confirmPasswordInput) {
    if (!passwordInput.value) {
        errors.push({ input: passwordInput, message: 'Enter a password.' });
    } else if (passwordInput.value.length < 6) {
        errors.push({ input: passwordInput, message: 'Use a password of at least 6 characters.' });
    }

    if (!confirmPasswordInput.value) {
        errors.push({ input: confirmPasswordInput, message: 'Confirm your password.' });
    } else if (passwordInput.value !== confirmPasswordInput.value) {
        errors.push({ input: confirmPasswordInput, message: 'Passwords do not match.' });
    }
}

function showValidationErrors(errors) {
    for (let index = 0; index < errors.length; index += 1) {
        setFieldError(errors[index].input, errors[index].message);
    }
    if (errors.length > 0) {
        errors[0].input.focus();
        return true;
    }
    return false;
}

function clearAllFieldErrors(form) {
    const fields = form.querySelectorAll('input, select, textarea');
    for (let index = 0; index < fields.length; index += 1) {
        setFieldError(fields[index], '');
    }
}

function clearFieldErrorsWhenEdited(form, formError) {
    const clearEditedError = function (event) {
        const input = event.target;
        if (!input.matches('input, select, textarea')) {
            return;
        }

        setFieldError(input, '');
        if (input.id === 'password') {
            const confirmInput = form.querySelector('#confirmPassword');
            if (confirmInput) {
                setFieldError(confirmInput, '');
            }
        } else if (input.id === 'newPassword') {
            const confirmInput = form.querySelector('#confirmNewPassword');
            if (confirmInput) {
                setFieldError(confirmInput, '');
            }
        } else if (input.id === 'setupPassword') {
            const confirmInput = form.querySelector('#confirmSetupPassword');
            if (confirmInput) {
                setFieldError(confirmInput, '');
            }
        }
        clearFormError(formError);
    };
    form.addEventListener('input', clearEditedError);
    form.addEventListener('change', clearEditedError);
}

function setFieldError(input, message) {
    const errorElement = document.getElementById(input.getAttribute('aria-describedby'));
    if (!errorElement) {
        return;
    }

    errorElement.textContent = message;
    errorElement.hidden = !message;
    if (message) {
        input.setAttribute('aria-invalid', 'true');
    } else {
        input.removeAttribute('aria-invalid');
    }
}

function clearFormError(element) {
    element.textContent = '';
    element.style.display = 'none';
}

function showFormError(element, message) {
    element.textContent = message;
    element.style.display = 'block';
}
