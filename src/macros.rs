#![macro_use]

macro_rules! err {
    ($msg:expr) => (
        Err(Error::new(&format!("{}", $msg)).into())
    );
    ($fmt:expr, $($arg:expr),+) => (
        Err(Error::new(&format!($fmt, $($arg),+)).into())
    );
}
