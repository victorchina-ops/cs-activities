using System;

class Program
{
    static bool IsEven(int n) { if (n == 0) return true; return IsOdd(n - 1); }
    static bool IsOdd(int n) { if (n == 0) return false; return IsEven(n - 1); }
    static void Main()
    {
        Console.WriteLine(IsEven(10));
        Console.WriteLine(IsOdd(7));
    }
}
