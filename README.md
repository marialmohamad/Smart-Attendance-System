# Smart Attendance System

Smart Attendance System automates attendance tracking using QR code scanning and manual input. It securely logs timestamped attendance records and supports multiple users simultaneously. The system includes an admin dashboard for managing users and monitoring attendance in real-time.

## Features

- User registration with role-based IDs (student or employee)
- Attendance marking via QR code or manual input
- Attendance logging with timestamps stored in SQLite database
- Real-time attendance monitoring and duplicate attendance prevention
- Admin panel to view, filter, and export attendance logs
- Secure user authentication with password hashing
- Password reset functionality with secure token generation
- Cross-platform compatibility (Windows, Linux, cloud)

## Technologies Used

- Python, Flask (web framework)
- SQLite (database)
- qrcode (QR code generation)
- bcrypt (password hashing)
- HTML, CSS, JavaScript (frontend)

## Getting Started

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/Smart-Attendance-System.git
